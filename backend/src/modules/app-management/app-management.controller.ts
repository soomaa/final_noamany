import {
  Body,
  Controller,
  Delete,
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
} from './dto/app-management.dto';

@UseGuards(JwtAuthGuard)
@Controller('app')
export class AppManagementController {
  constructor(private readonly service: AppManagementService) {}

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
  @RequiresPermission('app-management.invitations:view')
  listInvitations(@Query() query: ListInvitationsDto) {
    return this.service.listInvitations(query);
  }

  @Get('invitations/status/:status')
  @RequiresPermission('app-management.invitations:view')
  listByStatus(@Param('status') status: AmInvitationStatus) {
    return this.service.listInvitationsByStatus(status);
  }

  @Post('invitations')
  @RequiresPermission('app-management.invitations:create')
  createInvitation(@Body() body: CreateInvitationDto) {
    return this.service.createInvitation(body);
  }

  @Put('invitations/:id')
  @RequiresPermission('app-management.invitations:update')
  updateInvitation(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateInvitationDto) {
    return this.service.updateInvitation(id, body);
  }

  @Put('invitations/:id/status')
  @RequiresPermission('app-management.invitations:update')
  updateInvitationStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: AmInvitationStatus; rejectionReason?: string },
  ) {
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

  /** Fixed labels for the typed news filter in the member mobile app. */
  @Get('news/types')
  @Public()
  newsTypes() {
    return {
      data: [
        { value: 'nutrition', label: 'التغذية' },
        { value: 'championships', label: 'البطولات' },
        { value: 'exercises', label: 'التمارين' },
        { value: 'supplements', label: 'المكملات' },
      ],
    };
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
  listMemberNotifications(@Query() query: ListMemberNotificationsDto) {
    return this.service.listMemberNotifications(query);
  }

  @Post('notifications')
  @RequiresPermission('app-management.notifications:create')
  createMemberNotification(
    @Body() body: CreateMemberNotificationDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.createMemberNotification(body, userId);
  }

  @Delete('notifications/:id')
  @RequiresPermission('app-management.notifications:delete')
  deleteMemberNotification(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteMemberNotification(id);
  }
}
