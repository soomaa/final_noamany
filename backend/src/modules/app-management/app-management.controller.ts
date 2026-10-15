import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AmInvitationStatus } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AppManagementService } from './app-management.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CreateInvitationDto,
  CreateMemberNotificationDto,
  ListAppItemsDto,
  ListInvitationsDto,
  ListMemberNotificationsDto,
  UpdateAboutAppDto,
  UpdateInvitationDto,
  UpsertAdDto,
  UpsertExerciseCategoryDto,
  UpsertExerciseDto,
  UpsertNewsDto,
  UpsertOfferDto,
  UpsertTrainerDto,
  UpsertPaymentMethodDto,
} from './dto/app-management.dto';

@UseGuards(JwtAuthGuard)
@Controller('app')
export class AppManagementController {
  constructor(
    private readonly service: AppManagementService,
    private readonly permissions: PermissionEngineService,
  ) {}

  private invitationResource(status: AmInvitationStatus) {
    return `app-management.invitations.${status === 'pending' ? 'sent' : status}`;
  }

  private async assertInvitationPermission(userId: number, status: AmInvitationStatus, action: 'view' | 'update') {
    if (!await this.permissions.can(userId, this.invitationResource(status), action)) {
      throw new ForbiddenException('ليس لديك صلاحية لهذا النوع من الدعوات');
    }
  }

  @Get('about')
  @Public()
  getAbout() {
    return this.service.getAbout();
  }

  @Put('about')
  @RequiresPermission('app-management.about:update')
  updateAbout(@Body() body: UpdateAboutAppDto) {
    return this.service.updateAbout(body);
  }

  @Get('invitations')
  @RequiresPermission(
    'app-management.invitations.sent:view',
    'app-management.invitations.accepted:view',
    'app-management.invitations.attended:view',
    'app-management.invitations.rejected:view',
  )
  async listInvitations(@Query() query: ListInvitationsDto, @CurrentUser('sub') userId: number) {
    if (query.status) {
      await this.assertInvitationPermission(userId, query.status, 'view');
    } else {
      const statuses: AmInvitationStatus[] = ['pending', 'accepted', 'attended', 'rejected'];
      const allowed = await Promise.all(statuses.map((status) => this.permissions.can(userId, this.invitationResource(status), 'view')));
      if (!allowed.every(Boolean)) throw new ForbiddenException('اختر حالة دعوة مسموحًا لك بعرضها');
    }
    return this.service.listInvitations(query);
  }

  @Get('invitations/status/:status')
  @RequiresPermission(
    'app-management.invitations.sent:view',
    'app-management.invitations.accepted:view',
    'app-management.invitations.attended:view',
    'app-management.invitations.rejected:view',
  )
  async listByStatus(@Param('status') status: AmInvitationStatus, @CurrentUser('sub') userId: number) {
    await this.assertInvitationPermission(userId, status, 'view');
    return this.service.listInvitationsByStatus(status);
  }

  @Post('invitations')
  @RequiresPermission('app-management.invitations.sent:create')
  createInvitation(@Body() body: CreateInvitationDto, @CurrentUser() user: JwtUser) {
    return this.service.createInvitation(body, user);
  }

  @Put('invitations/:id')
  @RequiresPermission(
    'app-management.invitations.sent:update',
    'app-management.invitations.accepted:update',
    'app-management.invitations.attended:update',
    'app-management.invitations.rejected:update',
  )
  async updateInvitation(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateInvitationDto, @CurrentUser('sub') userId: number) {
    await this.assertInvitationPermission(userId, await this.service.invitationStatus(id), 'update');
    return this.service.updateInvitation(id, body);
  }

  @Put('invitations/:id/status')
  @RequiresPermission(
    'app-management.invitations.sent:update',
    'app-management.invitations.accepted:update',
    'app-management.invitations.attended:update',
    'app-management.invitations.rejected:update',
  )
  async updateInvitationStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: AmInvitationStatus; rejectionReason?: string },
    @CurrentUser('sub') userId: number,
  ) {
    await this.assertInvitationPermission(userId, await this.service.invitationStatus(id), 'update');
    return this.service.updateInvitation(id, {
      status: body.status,
      rejectionReason: body.rejectionReason,
    });
  }

  @Get('offers')
  @Public()
  listOffers(@Query() query: ListAppItemsDto) {
    return this.service.listOffers(query);
  }

  @Post('offers')
  @RequiresPermission('app-management.offers:create')
  createOffer(@Body() body: UpsertOfferDto) {
    return this.service.createOffer(body);
  }

  @Put('offers/:id')
  @RequiresPermission('app-management.offers:update')
  updateOffer(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertOfferDto) {
    return this.service.updateOffer(id, body);
  }

  @Delete('offers/:id')
  @RequiresPermission('app-management.offers:delete')
  deleteOffer(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteOffer(id);
  }

  @Get('trainers')
  @Public()
  listTrainers(@Query() query: ListAppItemsDto) {
    return this.service.listTrainers(query);
  }

  @Post('trainers')
  @RequiresPermission('app-management.trainers:create')
  createTrainer(@Body() body: UpsertTrainerDto) {
    return this.service.createTrainer(body);
  }

  @Put('trainers/:id')
  @RequiresPermission('app-management.trainers:update')
  updateTrainer(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertTrainerDto) {
    return this.service.updateTrainer(id, body);
  }

  @Delete('trainers/:id')
  @RequiresPermission('app-management.trainers:delete')
  deleteTrainer(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteTrainer(id);
  }

  @Get('exercise-categories')
  @Public()
  listCategories(@Query() query: ListAppItemsDto) {
    return this.service.listExerciseCategories(query);
  }

  @Post('exercise-categories')
  @RequiresPermission('app-management.exercise-categories:create')
  createCategory(@Body() body: UpsertExerciseCategoryDto) {
    return this.service.createExerciseCategory(body);
  }

  @Put('exercise-categories/:id')
  @RequiresPermission('app-management.exercise-categories:update')
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertExerciseCategoryDto) {
    return this.service.updateExerciseCategory(id, body);
  }

  @Delete('exercise-categories/:id')
  @RequiresPermission('app-management.exercise-categories:delete')
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteExerciseCategory(id);
  }

  @Get('exercises')
  @Public()
  listExercises(@Query() query: ListAppItemsDto) {
    return this.service.listExercises(query);
  }

  @Post('exercises')
  @RequiresPermission('app-management.exercises:create')
  createExercise(@Body() body: UpsertExerciseDto) {
    return this.service.createExercise(body);
  }

  @Put('exercises/:id')
  @RequiresPermission('app-management.exercises:update')
  updateExercise(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertExerciseDto) {
    return this.service.updateExercise(id, body);
  }

  @Delete('exercises/:id')
  @RequiresPermission('app-management.exercises:delete')
  deleteExercise(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteExercise(id);
  }

  @Get('news')
  @Public()
  listNews(@Query() query: ListAppItemsDto) {
    return this.service.listNews(query);
  }

  @Post('news')
  @RequiresPermission('app-management.news:create')
  createNews(@Body() body: UpsertNewsDto) {
    return this.service.createNews(body);
  }

  @Put('news/:id')
  @RequiresPermission('app-management.news:update')
  updateNews(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertNewsDto) {
    return this.service.updateNews(id, body);
  }

  @Delete('news/:id')
  @RequiresPermission('app-management.news:delete')
  deleteNews(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteNews(id);
  }

  @Get('ads')
  @Public()
  listAds(@Query() query: ListAppItemsDto) {
    return this.service.listAds(query);
  }

  @Post('ads')
  @RequiresPermission('app-management.ads:create')
  createAd(@Body() body: UpsertAdDto) {
    return this.service.createAd(body);
  }

  @Put('ads/:id')
  @RequiresPermission('app-management.ads:update')
  updateAd(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertAdDto) {
    return this.service.updateAd(id, body);
  }

  @Delete('ads/:id')
  @RequiresPermission('app-management.ads:delete')
  deleteAd(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteAd(id);
  }

  // ── Member notifications ─────────────────────────────────────────────────────

  @Get('notifications')
  @RequiresPermission('app-management.notifications:view')
  listMemberNotifications(@Query() query: ListMemberNotificationsDto, @CurrentUser() user: JwtUser) {
    return this.service.listMemberNotifications(query, user);
  }

  @Post('notifications')
  @RequiresPermission('app-management.notifications:create')
  createMemberNotification(
    @Body() body: CreateMemberNotificationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createMemberNotification(body, user.sub, user);
  }

  @Delete('notifications/:id')
  @RequiresPermission('app-management.notifications:delete')
  deleteMemberNotification(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteMemberNotification(id);
  }

  @Get('payment-methods/manage')
  @RequiresPermission('app-management.payment-methods:view')
  listPaymentMethodsForAdmin(@CurrentUser() user: JwtUser) {
    return this.service.listPaymentMethodsForAdmin(user);
  }

  @Get('payment-methods')
  @Public()
  listPaymentMethods(@Query('branchId') branchId?: string) {
    const parsed = branchId != null && branchId !== '' ? Number(branchId) : NaN;
    return this.service.listPaymentMethodsForMember(Number.isInteger(parsed) ? parsed : undefined);
  }

  @Post('payment-methods')
  @RequiresPermission('app-management.payment-methods:create')
  createPaymentMethod(@Body() body: UpsertPaymentMethodDto, @CurrentUser() user: JwtUser) {
    return this.service.createPaymentMethod(body, user);
  }

  @Put('payment-methods/:id')
  @RequiresPermission('app-management.payment-methods:update')
  updatePaymentMethod(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertPaymentMethodDto, @CurrentUser() user: JwtUser) {
    return this.service.updatePaymentMethod(id, body, user);
  }

  @Delete('payment-methods/:id')
  @RequiresPermission('app-management.payment-methods:delete')
  deletePaymentMethod(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.deletePaymentMethod(id, user);
  }
}
