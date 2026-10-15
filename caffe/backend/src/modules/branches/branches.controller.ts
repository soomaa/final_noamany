import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@UseGuards(JwtAuthGuard)
@Controller('branches')
@RequiresPermission('org.branches:view')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  findAll() {
    return this.branches.findAll();
  }

  @Post()
  @RequiresPermission('org.branches:create')
  create(@Body() dto: CreateBranchDto) {
    return this.branches.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('org.branches:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBranchDto) {
    return this.branches.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('org.branches:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.branches.remove(id);
  }
}
