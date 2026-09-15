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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CoursesDto,
  CreateApplicationDto,
  InterviewDateDto,
  InterviewDto,
  JobOfferDto,
  PersonsDto,
  PreviousWorkDto,
  QualificationsDto,
  SkillsDto,
  UpdateApplicationDto,
} from './dto/application.dto';
import {
  CreateJobRequestDto,
  ListApplicationsDto,
  ListJobRequestsDto,
  UpdateJobRequestDto,
} from './dto/job-request.dto';
import { JobRequestsService } from './job-requests.service';

@UseGuards(JwtAuthGuard)
@Controller('hr/job-requests')
@RequiresPermission('affairs.job_requests:view')
export class JobRequestsController {
  constructor(private readonly jobRequests: JobRequestsService) {}

  @Get()
  list(@Query() query: ListJobRequestsDto) {
    return this.jobRequests.list(query);
  }

  /* ----------------------- applications --------------------------- */
  @Get('applications')
  listApplications(@Query() query: ListApplicationsDto) {
    return this.jobRequests.listApplications(query);
  }

  @Get('applications/offers')
  listOffers(@Query() query: ListApplicationsDto) {
    return this.jobRequests.listOffers(query);
  }

  @Post('applications')
  createApplication(@Body() dto: CreateApplicationDto) {
    return this.jobRequests.createApplication(dto);
  }

  @Get('applications/:id')
  getApplication(@Param('id', ParseIntPipe) id: number) {
    return this.jobRequests.getApplication(id);
  }

  @Patch('applications/:id')
  updateApplication(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateApplicationDto) {
    return this.jobRequests.updateApplication(id, dto);
  }

  @Delete('applications/:id')
  removeApplication(@Param('id', ParseIntPipe) id: number) {
    return this.jobRequests.removeApplication(id);
  }

  /* --------------------- intake sub-forms ------------------------- */
  @Post('applications/:id/previous-work')
  savePreviousWork(@Param('id', ParseIntPipe) id: number, @Body() dto: PreviousWorkDto) {
    return this.jobRequests.savePreviousWork(id, dto);
  }

  @Post('applications/:id/qualifications')
  saveQualifications(@Param('id', ParseIntPipe) id: number, @Body() dto: QualificationsDto) {
    return this.jobRequests.saveQualifications(id, dto);
  }

  @Post('applications/:id/courses')
  saveCourses(@Param('id', ParseIntPipe) id: number, @Body() dto: CoursesDto) {
    return this.jobRequests.saveCourses(id, dto);
  }

  @Post('applications/:id/skills')
  saveSkills(@Param('id', ParseIntPipe) id: number, @Body() dto: SkillsDto) {
    return this.jobRequests.saveSkills(id, dto);
  }

  @Post('applications/:id/references')
  savePersons(@Param('id', ParseIntPipe) id: number, @Body() dto: PersonsDto) {
    return this.jobRequests.savePersons(id, dto);
  }

  /* ------------------------- interview ---------------------------- */
  @Patch('applications/:id/interview-date')
  setInterviewDate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InterviewDateDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.jobRequests.setInterviewDate(id, dto, user.sub);
  }

  @Get('applications/:id/interview')
  getInterview(@Param('id', ParseIntPipe) id: number) {
    return this.jobRequests.getInterview(id);
  }

  @Post('applications/:id/interview')
  saveInterview(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InterviewDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.jobRequests.saveInterview(id, dto, user.name);
  }

  /* ------------------------- job offers --------------------------- */
  @Get('applications/:id/offer')
  getJobOffer(@Param('id', ParseIntPipe) id: number) {
    return this.jobRequests.getJobOffer(id);
  }

  @Post('applications/:id/offer')
  saveJobOffer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: JobOfferDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.jobRequests.saveJobOffer(id, dto, user.name);
  }

  /* ---------------------- job postings (need) --------------------- */
  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.jobRequests.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateJobRequestDto, @CurrentUser() user: JwtUser) {
    return this.jobRequests.create(dto, user.sub);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobRequestDto) {
    return this.jobRequests.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.jobRequests.remove(id);
  }
}
