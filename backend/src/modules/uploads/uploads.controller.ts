import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Optional,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { JwtUser } from '../../common/types/jwt-user';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { FILE_CATEGORY_ADAPTER, FileCategoryAdapter, HrFileCategoryAdapter } from '../../ports/files/file-category.adapter';

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly permissions: PermissionEngineService,
    @Optional() @Inject(FILE_CATEGORY_ADAPTER)
    private readonly categories: FileCategoryAdapter = new HrFileCategoryAdapter(),
  ) {}

  /** POST /api/uploads/:category (multipart field "file") → { path, filename, url }. */
  @Post(':category')
  @ScopedHrData()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(
    @Param('category') category: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
    @Body('ownerEmployeeId') ownerEmployeeIdRaw?: string,
  ) {
    await this.assertCategoryPermission(user.sub, category);
    const ownerEmployeeId = ownerEmployeeIdRaw ? Number(ownerEmployeeIdRaw) : undefined;
    if (ownerEmployeeIdRaw && (!Number.isInteger(ownerEmployeeId) || ownerEmployeeId! <= 0)) {
      throw new ForbiddenException('معرّف الموظف غير صالح');
    }
    return this.uploads.store(category, file, user, ownerEmployeeId);
  }

  @Get('files/:id')
  @ScopedHrData()
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Res() response: Response,
  ) {
    const file = await this.uploads.open(id, user);
    await this.assertCategoryPermission(user.sub, file.row.category, 'download');
    return this.sendFile(response, file, false);
  }

  @Public()
  @Get('public/:id')
  async publicMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const file = await this.uploads.openPublic(id);
    return this.sendFile(response, file, true);
  }

  @Delete('files/:id')
  @ScopedHrData()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    const file = await this.uploads.open(id, user);
    await this.assertCategoryPermission(user.sub, file.row.category, 'upload');
    return this.uploads.remove(id, user);
  }

  private async assertCategoryPermission(
    userId: number,
    category: string,
    access: 'upload' | 'download' = 'upload',
  ): Promise<void> {
    const policy = this.categories.policy(category);
    const required = access === 'upload' ? policy?.uploadPermissions : policy?.downloadPermissions;
    if (!required?.length || !(await this.permissions.canAny(userId, [...required]))) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى ملف لهذا الجزء');
    }
  }

  private sendFile(
    response: Response,
    file: Awaited<ReturnType<UploadsService['open']>>,
    publicMedia: boolean,
  ) {
    response.setHeader('Content-Type', file.row.mime_type);
    response.setHeader(
      'Cache-Control',
      publicMedia ? 'public, max-age=31536000, immutable' : 'private, no-store',
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const disposition = file.row.mime_type.startsWith('image/') ? 'inline' : 'attachment';
    response.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(file.row.original_name)}`,
    );
    return response.sendFile(file.absolutePath);
  }
}
