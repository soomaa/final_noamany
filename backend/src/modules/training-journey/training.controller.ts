import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentMember } from "../../common/decorators/current-member.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { RequiresPermission } from "../../common/decorators/requires-permission.decorator";
import { JwtUser } from "../../common/types/jwt-user";
import { MemberJwtUser } from "../../common/types/member-jwt-user";
import { MemberJwtAuthGuard } from "../member/guards/member-jwt-auth.guard";
import { TrainerTrainingGuard } from "./trainer-training.guard";
import { TrainingService } from "./training.service";

@Controller("club-training")
@RequiresPermission("club.fitness.programs:view")
export class TrainingAdminController {
  constructor(private readonly service: TrainingService) {}
  @Get("catalog") catalog(@CurrentUser() user: JwtUser) {
    return this.service.catalog(user);
  }
  @Post("exercises")
  @RequiresPermission("club.fitness.strength:create")
  exercise(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.saveExercise({ ...body, key: undefined }, user);
  }
  @Put("exercises")
  @RequiresPermission("club.fitness.strength:update")
  updateExercise(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    if (!body.key) throw new BadRequestException("معرف التمرين مطلوب");
    return this.service.saveExercise(body, user);
  }
  @Get("trainers")
  trainers(
    @Query("memberId", ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.trainers(memberId, user);
  }
  @Get("plans") plans(@CurrentUser() user: JwtUser) {
    return this.service.plans(user);
  }
  @Post("plans")
  @RequiresPermission("club.fitness.programs:create")
  plan(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.savePlan({ ...body, id: undefined }, user);
  }
  @Put("plans")
  @RequiresPermission("club.fitness.programs:update")
  updatePlan(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    if (!body.id) throw new BadRequestException("معرف البرنامج مطلوب");
    return this.service.savePlan(body, user);
  }
  @Get("members/:memberId")
  journey(
    @Param("memberId", ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.journey(id, user);
  }
  @Get("members/:memberId/sessions")
  olderSessions(
    @Param("memberId", ParseIntPipe) id: number,
    @Query("cursor") cursor: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.olderSessions(id, cursor, user);
  }
  @Post("members/:memberId/assign")
  @RequiresPermission("club.fitness.programs:create")
  assign(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.assign(id, body, user);
  }
  @Post("members/:memberId/handover")
  @RequiresPermission("club.fitness.programs:update")
  handover(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.handover(id, body, user);
  }
  @Post("members/:memberId/sessions")
  @RequiresPermission("club.fitness.progress:create")
  createSession(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.saveSession(id, { ...body, revision: 0 }, user);
  }
  @Put("members/:memberId/sessions")
  @RequiresPermission("club.fitness.progress:update")
  session(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    if (Number(body.revision) < 1)
      throw new BadRequestException("استخدم تسجيل حصة جديدة");
    return this.service.saveSession(id, body, user);
  }
  @Post("members/:memberId/metrics")
  @RequiresPermission("club.fitness.assessments:create")
  metric(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.metric(id, body, user);
  }
  @Get("members/:memberId/photos/:id/content")
  async photo(
    @Param("memberId", ParseIntPipe) member: number,
    @Param("id") id: string,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    const photo = await this.service.photo(member, id, user);
    res
      .set({
        "Content-Type": photo.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(photo.content);
  }
  @Post("members/:memberId/body/checkins")
  @RequiresPermission("club.fitness.assessments:create")
  bodyCheckin(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.bodyCheckin(id, body, user);
  }
  @Put("members/:memberId/body/target")
  @RequiresPermission("club.fitness.assessments:update")
  bodyTarget(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.bodyTarget(id, body, user);
  }
}

@Controller("trainer-portal/training")
@UseGuards(TrainerTrainingGuard)
@RequiresPermission("trainer.portal:view")
export class TrainerTrainingController {
  constructor(private readonly service: TrainingService) {}
  @Get("catalog") catalog(@CurrentUser() user: JwtUser) {
    return this.service.catalog(user);
  }
  @Get("members")
  members(@CurrentUser() user: JwtUser, @Query("search") search?: string) {
    return this.service.trainerMembers(user, search);
  }
  @Post("exercises")
  @RequiresPermission("trainer.portal:view")
  exercise(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.saveExercise({ ...body, key: undefined }, user);
  }
  @Put("exercises")
  @RequiresPermission("trainer.portal:view")
  updateExercise(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    if (!body.key) throw new BadRequestException("معرف التمرين مطلوب");
    return this.service.saveExercise(body, user);
  }
  @Get("trainers")
  trainers(
    @Query("memberId", ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.trainers(memberId, user);
  }
  @Get("plans") plans(@CurrentUser() user: JwtUser) {
    return this.service.plans(user);
  }
  @Post("plans")
  @RequiresPermission("trainer.portal:view")
  plan(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.savePlan({ ...body, id: undefined }, user);
  }
  @Put("plans")
  @RequiresPermission("trainer.portal:view")
  updatePlan(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    if (!body.id) throw new BadRequestException("معرف البرنامج مطلوب");
    return this.service.savePlan(body, user);
  }
  @Get("members/:memberId")
  journey(
    @Param("memberId", ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.journey(id, user);
  }
  @Get("members/:memberId/sessions")
  olderSessions(
    @Param("memberId", ParseIntPipe) id: number,
    @Query("cursor") cursor: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.olderSessions(id, cursor, user);
  }
  @Post("members/:memberId/assign")
  @RequiresPermission("trainer.portal:view")
  assign(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.assign(id, body, user);
  }
  @Post("members/:memberId/handover")
  @RequiresPermission("trainer.portal:view")
  handover(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.handover(id, body, user);
  }
  @Post("members/:memberId/sessions")
  @RequiresPermission("trainer.portal:view")
  createSession(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.saveSession(id, { ...body, revision: 0 }, user);
  }
  @Put("members/:memberId/sessions")
  @RequiresPermission("trainer.portal:view")
  session(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    if (Number(body.revision) < 1)
      throw new BadRequestException("استخدم تسجيل حصة جديدة");
    return this.service.saveSession(id, body, user);
  }
  @Post("members/:memberId/metrics")
  @RequiresPermission("trainer.portal:view")
  metric(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.metric(id, body, user);
  }
  @Get("members/:memberId/photos/:id/content")
  async photo(
    @Param("memberId", ParseIntPipe) member: number,
    @Param("id") id: string,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    const photo = await this.service.photo(member, id, user);
    res
      .set({
        "Content-Type": photo.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(photo.content);
  }
  @Post("members/:memberId/body/checkins")
  @RequiresPermission("trainer.portal:view")
  bodyCheckin(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.bodyCheckin(id, body, user);
  }
  @Put("members/:memberId/body/target")
  @RequiresPermission("trainer.portal:view")
  bodyTarget(
    @Param("memberId", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.bodyTarget(id, body, user);
  }
}

@Public()
@UseGuards(MemberJwtAuthGuard)
@Controller("member/training")
export class TrainingMemberController {
  constructor(private readonly service: TrainingService) {}
  @Get() journey(@CurrentMember() user: MemberJwtUser) {
    return this.service.journey(user.memberId, user);
  }
  @Get("catalog") catalog(@CurrentMember() user: MemberJwtUser) {
    return this.service.catalog(user);
  }
  @Get("sessions") olderSessions(
    @Query("cursor") cursor: string,
    @CurrentMember() user: MemberJwtUser,
  ) {
    return this.service.olderSessions(user.memberId, cursor, user);
  }
  @Put("sessions") session(
    @Body() body: Record<string, unknown>,
    @CurrentMember() user: MemberJwtUser,
  ) {
    return this.service.saveSession(user.memberId, body, user);
  }
  @Post("metrics") metric(
    @Body() body: Record<string, unknown>,
    @CurrentMember() user: MemberJwtUser,
  ) {
    return this.service.metric(user.memberId, body, user);
  }
  @Post("body/checkins") bodyCheckin(
    @Body() body: Record<string, unknown>,
    @CurrentMember() user: MemberJwtUser,
  ) {
    return this.service.bodyCheckin(user.memberId, body, user);
  }
  @Put("body/target") bodyTarget(
    @Body() body: Record<string, unknown>,
    @CurrentMember() user: MemberJwtUser,
  ) {
    return this.service.bodyTarget(user.memberId, body, user);
  }
  @Post("photos")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    }),
  )
  photo(
    @UploadedFile() image: Express.Multer.File,
    @Body() body: Record<string, unknown>,
    @CurrentMember() user: MemberJwtUser,
  ) {
    return this.service.addPhoto(user.memberId, body, image, user);
  }
  @Get("photos/:id/content")
  async content(
    @Param("id") id: string,
    @CurrentMember() user: MemberJwtUser,
    @Res() res: Response,
  ) {
    const photo = await this.service.photo(user.memberId, id, user);
    res
      .set({
        "Content-Type": photo.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(photo.content);
  }
  @Put("photos/:id/consent") consent(
    @Param("id") id: string,
    @Body("shared") shared: unknown,
    @CurrentMember() user: MemberJwtUser,
  ) {
    return this.service.photoConsent(user.memberId, id, shared, user);
  }
  @Delete("photos/:id") delete(
    @Param("id") id: string,
    @CurrentMember() user: MemberJwtUser,
  ) {
    return this.service.deletePhoto(user.memberId, id, user);
  }
}
