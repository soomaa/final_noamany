import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import {
  AckLegalFileDto,
  CreateLegalFileDto,
  ListLegalFilesDto,
  UpdateLegalFileDto,
} from './dto/legal-files.dto';
import { LegalFilesService } from './legal-files.service';

@UseGuards(JwtAuthGuard)
@Controller('legal-files')
@RequiresPermission('affairs.legal_files:view')
export class LegalFilesController {
  constructor(private readonly legalFiles: LegalFilesService) {}

  @Get()
  list(@Query() query: ListLegalFilesDto) {
    return this.legalFiles.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.legalFiles.get(id);
  }

  @Get(':id/seens')
  listSeens(@Param('id', ParseIntPipe) id: number) {
    return this.legalFiles.listSeens(id);
  }

  @Post()
  @RequiresPermission('affairs.legal_files:create')
  create(@Body() dto: CreateLegalFileDto, @CurrentUser() user: JwtUser) {
    return this.legalFiles.create(dto, user);
  }

  @Post(':id/seen')
  ack(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AckLegalFileDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.legalFiles.ack(id, dto, user);
  }

  @Patch(':id')
  @RequiresPermission('affairs.legal_files:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLegalFileDto) {
    return this.legalFiles.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('affairs.legal_files:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.legalFiles.remove(id);
  }
}
