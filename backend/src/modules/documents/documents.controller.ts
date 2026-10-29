import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { DocumentsService } from './documents.service';

@UseGuards(JwtAuthGuard)
@Controller('documents')
@RequiresPermission('employees.documents:view')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('expiring')
  expiring(@CurrentUser() user: JwtUser, @Query('days') days?: string) {
    return this.documents.expiring(days ? parseInt(days, 10) : 30, user);
  }

  @Get()
  list(@Query() query: ListQueryDto, @CurrentUser() user: JwtUser) {
    return this.documents.list(query, user);
  }

  @Post()
  @RequiresPermission('employees.documents:create')
  create(
    @Body() body: { empId: number; title: string; filePath?: string; docType?: number; expiryDate?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.documents.create(body, user);
  }

  @Delete(':id')
  @RequiresPermission('employees.documents:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.documents.remove(id, user);
  }
}
