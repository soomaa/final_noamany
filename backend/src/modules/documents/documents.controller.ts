import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { DocumentsService } from './documents.service';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';
import { CreateDocumentDto } from './dto/document.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('documents')
@RequiresPermission('employees.documents:view')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('expiring')
  @ScopedHrData()
  expiring(@CurrentUser() user: JwtUser, @Query('days') days?: string) {
    return this.documents.expiring(days ? parseInt(days, 10) : 30, user);
  }

  @Get()
  @ScopedHrData()
  list(@Query() query: ListQueryDto, @CurrentUser() user: JwtUser) {
    return this.documents.list(query, user);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('employees.documents:create')
  create(
    @Body() body: CreateDocumentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.documents.create(body, user);
  }

  @Delete(':id')
  @ScopedHrData()
  @RequiresPermission('employees.documents:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.documents.remove(id, user);
  }
}
