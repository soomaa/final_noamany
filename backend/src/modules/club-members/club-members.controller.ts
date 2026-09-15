import {
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubMembersService } from './club-members.service';
import { BlockClubMemberDto } from './dto/block-club-member.dto';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { UpsertClubMemberDto } from './dto/upsert-club-member.dto';
import { AdjustClubMemberPointsDto } from './dto/adjust-club-member-points.dto';
import { assertSystemAdmin } from '../../common/utils/system-admin.util';

@UseGuards(JwtAuthGuard)
@Controller('club-members')
@RequiresPermission('club.members:view', 'club.reception:view')
export class ClubMembersController {
  constructor(private readonly service: ClubMembersService) {}

  @Get()
  list(@Query() query: ListClubMembersDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.statistics(user);
  }

  @Get('sales-portal')
  @RequiresPermission('sales.portal:view')
  salesPortal(@CurrentUser() user: JwtUser) { return this.service.salesPortal(user); }

  @Get('sales-renewals')
  @RequiresPermission('sales.portal:view')
  salesRenewals(@CurrentUser() user: JwtUser, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('window') window?: string, @Query('search') search?: string) {
    return this.service.salesRenewals(user, { page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined, window, search });
  }

  @Get('check-duplicate')
  checkDuplicate(
    @Query('phone') phone?: string,
    @Query('cardNumber') cardNumber?: string,
    @Query('branchId') branchId?: string,
    @Query('excludeMemberId') excludeMemberId?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    const exclude = excludeMemberId ? Number(excludeMemberId) : undefined;
    const branch = branchId ? Number(branchId) : undefined;
    return this.service.checkDuplicates({
      phone,
      cardNumber,
      branchId: branch && !Number.isNaN(branch) ? branch : undefined,
      excludeMemberId: exclude && !Number.isNaN(exclude) ? exclude : undefined,
    }, user);
  }

  @Get('next-code')
  nextCode(@Query('branchId') branchId?: string, @CurrentUser() user?: JwtUser) {
    const parsed = branchId ? Number(branchId) : undefined;
    return this.service.nextCode(parsed && !Number.isNaN(parsed) ? parsed : undefined, user);
  }

  @Get('barcode-range')
  barcodeRange(
    @Query('codeFrom') codeFrom: string,
    @Query('codeTo') codeTo: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.barcodeRange(codeFrom, codeTo, user);
  }

  @Get('barcode-preview')
  barcodePreview(@Query('memberCode') memberCode: string, @CurrentUser() user: JwtUser) {
    return this.service.barcodePreview(memberCode, user);
  }

  /** All branch-scoped members for subscription/event pickers (no sales-rep ownership filter). */
  @Get('select-options')
  @RequiresPermission('club.members:view', 'club.subscriptions:view')
  selectOptions(@Query() query: ListClubMembersDto, @CurrentUser() user: JwtUser) {
    query.forSelect = true;
    return this.service.list(query, user);
  }

  @Get(':id/financial-history')
  financialHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.financialHistory(id, user, dateFrom, dateTo);
  }

  @Get(':id/point-history')
  pointHistory(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.pointHistory(id, user);
  }

  @Post(':id/point-adjustments')
  @RequiresPermission('club.members:update')
  adjustPoints(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdjustClubMemberPointsDto,
    @CurrentUser() user: JwtUser,
  ) {
    assertSystemAdmin(user);
    return this.service.adjustPoints(id, body, user);
  }

  @Get(':id/deletion-preview')
  deletionPreview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('stopDate') stopDate?: string,
  ) {
    return this.service.deletionPreview(id, user, stopDate);
  }

  @Get(':id/membership-document')
  membershipDocument(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.getMembershipDocument(id, user);
  }

  @Get(':id/membership-document/file')
  async downloadLegacyMembershipDocument(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Res() response: Response,
  ) {
    const document = await this.service.readLegacyMembershipDocument(id, user);
    const encodedFilename = encodeURIComponent(document.originalFilename).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="member-document.pdf"; filename*=UTF-8''${encodedFilename}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(document.buffer);
  }

  @Post(':id/membership-document')
  @RequiresPermission('club.members:update')
  setMembershipDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body('path') path: string,
    @CurrentUser() user: JwtUser,
  ) {
    void id;
    void path;
    void user;
    throw new GoneException('استبدل رفع النموذج القديم بقائمة مستندات العضو الآمنة');
  }

  @Delete(':id/membership-document')
  @RequiresPermission('club.members:update')
  removeMembershipDocument(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeMembershipDocument(id, user);
  }

  @Get(':id/membership-documents')
  membershipDocuments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.listMembershipDocuments(id, user);
  }

  @Post(':id/membership-documents')
  @RequiresPermission('club.members:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadMembershipDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body('type') type: string,
    @Body('label') label: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.uploadMembershipDocument(id, type, label, file, user);
  }

  @Get(':id/membership-documents/:documentId/file')
  async downloadMembershipDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @CurrentUser() user: JwtUser,
    @Res() response: Response,
  ) {
    const document = await this.service.readMembershipDocument(id, documentId, user);
    const encodedFilename = encodeURIComponent(document.originalFilename).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="member-document.pdf"; filename*=UTF-8''${encodedFilename}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(document.buffer);
  }

  @Delete(':id/membership-documents/:documentId')
  @RequiresPermission('club.members:update')
  removeMembershipDocumentItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.removeMembershipDocumentItem(id, documentId, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.members:create')
  create(@Body() body: UpsertClubMemberDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.members:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertClubMemberDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Post(':id/block')
  @RequiresPermission('club.members:update', 'club.reception:update')
  block(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: BlockClubMemberDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.block(id, body.reason, user);
  }

  @Post(':id/unblock')
  @RequiresPermission('club.members:update', 'club.reception:update')
  unblock(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.unblock(id, user);
  }

  @Delete(':id')
  @RequiresPermission('club.members:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
