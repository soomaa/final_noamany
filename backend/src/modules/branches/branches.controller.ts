import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { JwtUser } from "../../common/types/jwt-user";
import { RequiresPermission } from "../../common/decorators/requires-permission.decorator";
import { BranchesService } from "./branches.service";
import { CreateBranchDto, UpdateBranchDto } from "./dto/branch.dto";

@UseGuards(JwtAuthGuard)
@Controller("branches")
@RequiresPermission("org.branches:view")
export class BranchesController {
  constructor(
    private readonly branches: BranchesService,
    private readonly branchScope: BranchScopeService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: JwtUser) {
    const rows = await this.branches.findAll();
    const allowed = this.branchScope.allowedBranchIds(user);
    return allowed === null
      ? rows
      : rows.filter((row) => allowed.includes(row.id));
  }

  @Post()
  @RequiresPermission("org.branches:create")
  create(@Body() dto: CreateBranchDto, @CurrentUser() user: JwtUser) {
    if (user.level !== 1) {
      throw new ForbiddenException("إنشاء الفروع متاح لمدير النظام فقط");
    }
    return this.branches.create(dto);
  }

  @Patch(":id")
  @RequiresPermission("org.branches:update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertBranchAccess(user, id);
    return this.branches.update(id, dto);
  }

  @Delete(":id")
  @RequiresPermission("org.branches:delete")
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    this.assertBranchAccess(user, id);
    return this.branches.remove(id);
  }

  private assertBranchAccess(user: JwtUser, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException("لا تملك صلاحية إدارة هذا الفرع");
    }
  }
}
