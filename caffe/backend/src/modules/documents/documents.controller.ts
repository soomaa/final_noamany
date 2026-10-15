import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { DocumentsService } from './documents.service';

@UseGuards(JwtAuthGuard)
@Controller('documents')
@RequiresPermission('employees.documents:view')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('expiring')
  expiring(@Query('days') days?: string) {
    return this.documents.expiring(days ? parseInt(days, 10) : 30);
  }

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.documents.list(query);
  }

  @Post()
  @RequiresPermission('employees.documents:create')
  create(
    @Body() body: { empId: number; title: string; filePath?: string; docType?: number; expiryDate?: string },
  ) {
    return this.documents.create(body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.documents.remove(id);
  }
}
