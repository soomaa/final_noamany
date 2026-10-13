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
import { ClubGroupOperation } from '../../common/branch-groups/club-operation-scope';

@UseGuards(JwtAuthGuard)
@Controller('club-members')
@RequiresPermission('club.members:view', 'club.reception:view')
export class ClubMembersController {
  constructor(private readonly service: ClubMembersService) {}

  @Get('lookup')
  @RequiresPermission('club.members:view', 'club.subscriptions:view')
  lookup(@Query('q') q: string, @Query('branch') branch: string | undefined, @Query('exactBranch') exactBranch: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.lookup(q ?? '', branch, user, exactBranch === 'true');
  }

  @Get('membership-operation-lookup')
  @RequiresPermission('club.subscriptions:create', 'club.subscriptions.list:create', 'club.subscriptions.new:create', 'club.subscriptions.special:create', 'club.reception:create', 'club.lockers:create', 'club.lockers.new:create')
  membershipOperationLookup(@Query('q') q: string, @Query('branch') branch: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.lookup(q ?? '', branch, user, false, true);
  }

  @Get('refund-transfer-lookup')
  @ClubGroupOperation()
  @RequiresPermission('club.subscriptions.member_transfer:view', 'club.subscriptions.member_transfer:create', 'club.subscriptions.refunds:view', 'club.subscriptions:update', 'club.subscriptions.list:update', 'club.reception:update')
  refundTransferLookup(@Query('q') q: string, @Query('branch') branch: string | undefined, @Query('exactBranch') exactBranch: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.lookup(q ?? '', branch, user, exactBranch === 'true', false, true);
  }

  @Get('measurement-operation-lookup')
  @ClubGroupOperation()
  @RequiresPermission('club.members.measurements:view', 'club.members.measurements:create', 'club.members.measurements:update')
  measurementOperationLookup(@Query('q') q: string, @Query('branch') branch: string | undefined, @CurrentUser() user: JwtUser) {
    const query = (q ?? '').trim();
    const normalized = /^[a-z]+[0-9]+$/i.test(query) ? query.toUpperCase() : query;
    return this.service.lookup(normalized, branch, user, false, false, true);
  }

  @Get('measurement-operation-member/:id')
  @ClubGroupOperation()
  @RequiresPermission('club.members.measurements:view', 'club.members.measurements:create', 'club.members.measurements:update')
  measurementOperationMember(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user, false, true);
  }

  @Get('refund-transfer-member/:id')
  @ClubGroupOperation()
  @RequiresPermission('club.subscriptions.member_transfer:view', 'club.subscriptions.member_transfer:create', 'club.subscriptions.refunds:view', 'club.subscriptions:update', 'club.subscriptions.list:update', 'club.reception:update')
  refundTransferMember(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user, false, true);
  }

  @Get('membership-operation-member/:id')
  @RequiresPermission('club.subscriptions:create', 'club.subscriptions.list:create', 'club.subscriptions.new:create', 'club.subscriptions.special:create', 'club.reception:create', 'club.lockers:create', 'club.lockers.new:create')
  membershipOperationMember(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user, true);
  }

  @Get()
  list(@Query() query: ListClubMembersDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('print-cards')
  @RequiresPermission('club.members.barcode_management:view', 'club.members.barcode.print_range:view')
  printCards(@Query() query: ListClubMembersDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user, true);
  }

  @Get('statistics')
  statistics(@Query() query: ListClubMembersDto, @CurrentUser() user: JwtUser) {
    return this.service.statistics(query, user);
  }

  @Get('birthdays-today')
  birthdaysToday(
    @Query('branchId') branchId?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.birthdaysToday(user, branchId ? Number(branchId) : undefined);
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
    response.setHeader('Content-Disposition', `inline; filename="member-document"; filename*=UTF-8''${encodedFilename}`);
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
    response.setHeader('Content-Disposition', `inline; filename="member-document"; filename*=UTF-8''${encodedFilename}`);
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

  @Get(':id/workspace')
  workspace(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.memberWorkspace(id, user);
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
