import {
  All,
  Body,
  Controller,
  HttpException,
  Param,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceReportDto } from '../attendance/dto/report.dto';
import { LeavesService } from '../leaves/leaves.service';
import { CreateLeaveDto } from '../leaves/dto/create-leave.dto';
import { ListLeavesDto } from '../leaves/dto/list-leaves.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { CreatePermissionDto } from '../permissions/dto/create-permission.dto';
import { ListPermissionsDto } from '../permissions/dto/list-permissions.dto';
import { MobileDailyTaskDto, MobileListDto } from './dto/mobile.dto';
import { MobileService } from './mobile.service';
import { LegacyMobileCompatService } from './legacy-mobile-compat.service';
import { UploadsService } from '../uploads/uploads.service';
import { LoansService } from '../loans/loans.service';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { normalizeLegacyTime } from './legacy-time.util';

type Input = Record<string, unknown>;

/**
 * Root /Api/* aliases consumed by the former mobile application. They preserve
 * method names, posted field aliases, and the {status,message,data} envelope,
 * while protected operations deliberately require the new JWT. Employee IDs
 * supplied by a client are never trusted; identity comes from the token.
 */
@UseGuards(JwtAuthGuard)
@Controller('Api')
export class LegacyMobileController {
  constructor(
    private readonly mobile: MobileService,
    private readonly leaves: LeavesService,
    private readonly permissions: PermissionsService,
    private readonly attendance: AttendanceService,
    private readonly compat: LegacyMobileCompatService,
    private readonly uploads: UploadsService,
    private readonly loans: LoansService,
  ) {}

  private value(input: Input, ...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = input[key];
      if (value != null && String(value).trim() !== '') return String(value).trim();
    }
    return undefined;
  }

  private id(input: Input, ...keys: string[]): number {
    const raw = this.value(input, ...keys);
    const value = raw ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value <= 0) throw new HttpException('تأكد من البيانات المدخلة', 400);
    return value;
  }

  private mobilePage(input: Input): MobileListDto {
    const query = new MobileListDto();
    query.page = Math.max(1, Number(this.value(input, 'page') ?? 1) || 1);
    query.perPage = Math.min(100, Math.max(1, Number(this.value(input, 'per_page', 'perPage') ?? 20) || 20));
    query.status = this.value(input, 'status');
    return query;
  }

  private page(input: Input): PaginationDto {
    const query = new PaginationDto();
    query.page = Math.max(1, Number(this.value(input, 'page') ?? 1) || 1);
    query.pageSize = Math.min(500, Math.max(1, Number(this.value(input, 'per_page', 'pageSize') ?? 20) || 20));
    return query;
  }

  private legacyCircularRow<T extends Record<string, unknown>>(row: T) {
    return {
      ...row,
      ...(row.detail_id != null || row.id != null ? { id: row.detail_id ?? row.id } : {}),
      seen: row.seen_value ?? String(row.seen ? 1 : 0),
    };
  }

  private legacyWarningRow<T extends Record<string, unknown>>(row: T) {
    return {
      ...row,
      seen: row.seen_value ?? String(row.seen ? 1 : 0),
    };
  }

  private async legacy<T>(action: () => Promise<T>, message = 'تمت العملية بنجاح') {
    try {
      return { status: 200, message, data: await action() };
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const errorMessage = typeof response === 'string'
          ? response
          : Array.isArray((response as { message?: unknown }).message)
            ? ((response as { message: string[] }).message.join(' . '))
            : String((response as { message?: unknown }).message ?? error.message);
        return { status: error.getStatus() === 401 ? 401 : 400, message: errorMessage, data: null };
      }
      throw error;
    }
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @All('login_app')
  login(@Body() body: Input, @Query() query: Input) {
    const input = { ...query, ...body };
    return (async () => {
      try {
        const login = this.value(input, 'phone', 'username', 'emp_code');
        const password = this.value(input, 'user_pass', 'password');
        if (!login || !password) throw new HttpException('تأكد من إدخال جميع الحقول', 400);
        const data = await this.mobile.legacyLogin(login, password);
        return { status: 200, message: 'تم التسجيل بنجاح', logout_option: 1, data };
      } catch (error) {
        if (error instanceof HttpException) {
          const response = error.getResponse();
          const message = typeof response === 'string'
            ? response
            : String((response as { message?: unknown }).message ?? error.message);
          return { status: 400, message, logout_option: 0, data: null };
        }
        throw error;
      }
    })();
  }

  @Public()
  @All('getAppinfo')
  appInfo() {
    return this.legacy(() => this.compat.appInfo(), 'تم العثور على نتائج');
  }

  @Public()
  @All('getAppPolicy')
  appPolicy() {
    return this.legacy(() => this.compat.appPolicy(), 'تم العثور على نتائج');
  }

  @Public()
  @All('SplashScreens')
  splashScreens() {
    return this.legacy(() => this.compat.splashScreens(), 'تم العثور على نتائج');
  }

  @Public()
  @All('Check_Option')
  checkOption(@Body() body: Input, @Query() query: Input) {
    return this.legacy(() => this.compat.checkOption({ ...query, ...body }), 'تم العثور على نتائج');
  }

  @All('getProfile')
  profile(@CurrentUser() user: JwtUser) {
    return this.legacy(() => this.mobile.profile(user), 'تم العثور علي نتائج');
  }

  @All('today_notification')
  notifications(@CurrentUser() user: JwtUser) {
    return this.legacy(() => this.mobile.notifications(user), 'لقد تم العثور علي نتائج');
  }

  @All('register_device_token')
  deviceToken(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => {
      const token = this.value(input, 'device_token', 'token');
      if (!token) throw new HttpException('رجاء ادخال جميع البيانات', 400);
      return this.mobile.setDeviceToken(user, token);
    });
  }

  @All('Agazat_types')
  leaveTypes(@Body() body: Input, @Query() query: Input) {
    const input = { ...query, ...body };
    return this.legacy(async () => (await this.leaves.listTypes(this.page(input))).data, 'لقد تم العثور علي نتائج');
  }

  @All('Get_agaza_List')
  leaveList(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    const paging = this.page(input);
    const dto = Object.assign(new ListLeavesDto(), paging, {
      mode: this.value(input, 'status') === 'wared' ? 'wared' : 'sader',
    });
    return this.legacy(async () => (await this.leaves.list(dto, user.sub)).data, 'تم العثور نتائج');
  }

  @All('Get_Agaza_data')
  leaveDetail(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => [await this.mobile.leave(user, this.id(input, 'agaza_id', 'id'))], 'تم العثور نتائج');
  }

  @All(['Add_Agaza', 'Add_Agazax'])
  @UseInterceptors(AnyFilesInterceptor({ limits: { files: 1, fileSize: 20 * 1024 * 1024 } }))
  createLeave(
    @Body() body: Input,
    @Query() query: Input,
    @CurrentUser() user: JwtUser,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const input: Input = { ...query, ...body };
    if (files[0]) input.hospital_report = this.uploads.store('document', files[0]).path;
    return this.legacy(async () => {
      const dto: CreateLeaveDto = {
        leaveTypeId: this.id(input, 'no3_agaza_id', 'leaveTypeId'),
        startDate: this.value(input, 'from_date', 'startDate') ?? '',
        endDate: this.value(input, 'to_date', 'endDate') ?? '',
        reason: this.value(input, 'reason'),
        hospitalReport: this.value(input, 'f_file', 'hospitalReport'),
      };
      if (!dto.startDate || !dto.endDate) throw new HttpException('رجاء تحديد التاريخ', 400);
      return this.leaves.create(dto, user.sub, user.name ?? undefined, { enforceLegacyMobileBalance: true });
    });
  }

  @All('Delete_agaza')
  cancelLeave(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => {
      const id = this.id(input, 'agaza_id', 'id');
      await this.mobile.leave(user, id);
      return this.leaves.cancel(id, user.sub, user.name ?? undefined);
    });
  }

  @All('Ozonat_types')
  permissionTypes() {
    return this.legacy(async () => [
      { id: 1, title: 'استئذان شخصي' },
      { id: 2, title: 'استئذان للعمل' },
    ], 'لقد تم العثور علي نتائج');
  }

  @All('Add_Ezn')
  createPermission(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => {
      const dto: CreatePermissionDto = {
        no3Ezn: this.id(input, 'ezn_type_id', 'no3Ezn'),
        eznDate: this.value(input, 'ezn_date', 'eznDate') ?? new Date().toISOString().slice(0, 10),
        fromHour: normalizeLegacyTime(this.value(input, 'from_time', 'fromHour') ?? ''),
        toHour: normalizeLegacyTime(this.value(input, 'to_time', 'toHour') ?? ''),
        reason: this.value(input, 'reason') ?? '',
        fatraFk: 1,
      };
      if (!dto.fromHour || !dto.toHour) throw new HttpException('رجاء تحديد الوقت', 400);
      return this.permissions.create(dto, user.sub, user.name ?? undefined);
    }, 'لقد تم إرسال الطلب بنجاح');
  }

  @All(['Get_Ezn_List', 'Get_Wared_Ezn_List'])
  permissionList(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    const paging = this.page(input);
    const dto = Object.assign(new ListPermissionsDto(), paging, {
      mode: this.value(input, 'status') === 'wared' ? 'wared' : 'sader',
    });
    return this.legacy(async () => (await this.permissions.list(dto, user.sub)).data, 'تم العثور نتائج');
  }

  @All('Get_Ezn_data')
  permissionDetail(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    return this.legacy(() => this.compat.permissionDetail(user, { ...query, ...body }), 'تم العثور على نتائج');
  }

  @All('Edit_Ezn')
  editPermission(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    return this.legacy(() => this.compat.editPermission(user, { ...query, ...body }));
  }

  @All('Delete_ezn')
  deletePermission(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    return this.legacy(() => this.compat.deletePermission(user, { ...query, ...body }));
  }

  @All('Egraa_ezn')
  actionPermission(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(() => this.permissions.action(
      this.id(input, 'ezn_id', 'id'),
      {
        action: this.value(input, 'action_option', 'action') === 'accept' ? 'accept' : 'reject',
        reason: this.value(input, 'reason'),
      },
      user.sub,
      user.name ?? undefined,
    ));
  }

  @All('Edit_Agaza')
  editLeave(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    return this.legacy(() => this.compat.editLeave(user, { ...query, ...body }));
  }

  @All('Egraa_agaza')
  actionLeave(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(() => this.leaves.action(
      this.id(input, 'agaza_id', 'id'),
      {
        action: this.value(input, 'action_option', 'action') === 'accept' ? 'accept' : 'reject',
        reason: this.value(input, 'reason'),
      },
      user.sub,
      user.name ?? undefined,
    ));
  }

  @All('Solaf_meta')
  loanMeta(@CurrentUser() user: JwtUser) {
    return this.legacy(() => this.loans.mobileMeta(user), 'تم العثور على النتائج');
  }

  @All('Get_Solaf_List')
  loanList(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    const paging = this.mobilePage(input);
    return this.legacy(async () => (await this.loans.mobileList(user, {
      page: paging.page,
      perPage: paging.perPage,
      mode: this.value(input, 'status', 'mode') === 'wared' ? 'wared' : 'sader',
    })).data, 'تم العثور على النتائج');
  }

  @All('Get_Solfa_data')
  loanDetail(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => [await this.loans.mobileDetail(
      user,
      this.id(input, 'solfa_id', 'loan_id', 'id'),
    )], 'تم العثور على النتائج');
  }

  @All('Add_Solfa')
  createLoan(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => {
      const amount = Number(this.value(input, 'qemt_solaf', 'amount'));
      const repaymentMethod = Number(this.value(input, 'sadad_solfa', 'repaymentMethod'));
      const installmentsRaw = this.value(input, 'qst_num', 'installments');
      const reason = this.value(input, 'solaf_reason', 'reason');
      if (!Number.isInteger(amount) || amount <= 0 || ![1, 2, 3].includes(repaymentMethod) || !reason) {
        throw new HttpException('تأكد من إدخال المبلغ وطريقة السداد وسبب السلفة', 400);
      }
      return this.loans.mobileCreate(user, {
        amount,
        repaymentMethod: repaymentMethod as 1 | 2 | 3,
        reason,
        installments: installmentsRaw ? Number(installmentsRaw) : undefined,
        deductionStartDate: this.value(input, 'khsm_form_date_m', 'deductionStartDate'),
      });
    }, 'تم إرسال طلب السلفة إلى المدير المباشر');
  }

  @All('Egraa_solfa')
  actionLoan(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(() => this.loans.mobileAction(
      user,
      this.id(input, 'solfa_id', 'loan_id', 'id'),
      {
        action: this.value(input, 'action_option', 'action') === 'accept' ? 'accept' : 'reject',
        reason: this.value(input, 'reason'),
      },
    ));
  }

  @All('Delete_solfa')
  cancelLoan(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(() => this.loans.mobileCancel(
      user,
      this.id(input, 'solfa_id', 'loan_id', 'id'),
    ));
  }

  @All('Add_Task')
  createTask(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => {
      const title = this.value(input, 'title');
      const notes = this.value(input, 'notes');
      const status = this.value(input, 'status');
      if (!title || !notes || !['inprogress', 'done'].includes(status ?? '')) {
        throw new HttpException('تأكد من البيانات المدخلة', 400);
      }
      return this.mobile.createDailyTask(user, { title, notes, status } as MobileDailyTaskDto);
    }, 'تم توثيق المهمة بنجاح');
  }

  @All('Get_Tasks_List')
  taskList(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => (await this.mobile.dailyTasks(user, this.mobilePage(input))).data, 'تم العثور نتائج');
  }

  @All('Delete_task')
  deleteTask(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(() => this.mobile.deleteDailyTask(user, this.id(input, 'task_id', 'id')));
  }

  @All('Get_ta3mem_list')
  circulars(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => (await this.mobile.circulars(user, this.mobilePage(input))).data
      .map((row) => this.legacyCircularRow(row)), 'تم العثور نتائج');
  }

  @All('Get_ta3mem_data')
  circular(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => [this.legacyCircularRow(
      await this.mobile.circular(user, this.id(input, 'ta3mem_id_fk', 'id')),
    )], 'تم العثور نتائج');
  }

  @All('SeenTa3mem')
  seenCircular(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(() => this.mobile.markCircularRead(user, this.id(input, 'ta3mem_id_fk', 'id')), 'لقد تم تحديد التعميم كمقروء');
  }

  @All('Get_Enzarat_list')
  warnings(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => (await this.mobile.warnings(user, this.mobilePage(input))).data
      .map((row) => this.legacyWarningRow(row)), 'تم العثور نتائج');
  }

  @All('Get_enzar_data')
  warning(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(async () => [this.legacyWarningRow(
      await this.mobile.warning(user, this.id(input, 'enzar_id_fk', 'id')),
    )], 'تم العثور نتائج');
  }

  @All('SeenEnzar')
  seenWarning(@Body() body: Input, @Query() query: Input, @CurrentUser() user: JwtUser) {
    const input = { ...query, ...body };
    return this.legacy(() => this.mobile.markWarningRead(user, this.id(input, 'enzar_id_fk', 'id')), 'لقد تم تحديد كمقروء');
  }

  @All(['add_hdor_ensraf', 'add_hdor_ensraf_asly', 'attendance_new', 'attendance'])
  @UseInterceptors(AnyFilesInterceptor({ limits: { files: 1, fileSize: 10 * 1024 * 1024 } }))
  punch(
    @Body() body: Input,
    @Query() query: Input,
    @CurrentUser() user: JwtUser,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const input: Input = { ...query, ...body };
    if (files[0]) input.basma_img = this.uploads.store('app', files[0]).path;
    return this.legacy(async () => {
      const lat = this.value(input, 'lat');
      const long = this.value(input, 'long', 'lng');
      if (!lat || !long) throw new HttpException('بيانات الموظف أو الموقع غير كاملة', 400);
      return this.attendance.mobilePunch(user, {
        lat,
        long,
        photo: this.value(input, 'basma_img', 'photo'),
      });
    });
  }

  /**
   * Remaining installed-app aliases. Explicit routes above keep the complex HR
   * workflow services in charge; this dispatcher covers legacy app modules that
   * are simple employee-scoped CRUD/read feeds.
   */
  @All(':action')
  @UseInterceptors(AnyFilesInterceptor({ limits: { files: 10, fileSize: 20 * 1024 * 1024 } }))
  legacyAction(
    @Param('action') action: string,
    @Body() body: Input,
    @Query() query: Input,
    @CurrentUser() user: JwtUser,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const input: Input = { ...query, ...body };
    if (files.length) {
      const category = action === 'update_profile_image' ? 'emp-photo'
        : action === 'Add_signature' ? 'signature'
          : action === 'add_nashat' ? 'activity'
            : action === 'SendMessage' ? 'message' : 'app';
      const stored = files.map((file) => this.uploads.store(category, file));
      input.files = stored.map((file) => file.path);
      input.file_name = stored[0].path;
      if (action === 'SendMessage') input.msg_image = stored[0].path;
      if (action === 'update_profile_image') input.m_image = stored[0].filename;
      if (action === 'Add_signature') input.m_image = stored[0].filename;
      if (action === 'Add_location_basma') input.emp_img = stored[0].path;
    }
    const operations: Record<string, () => Promise<unknown>> = {
      AllEmplyees: () => this.compat.employees(user, input),
      SendMessage: () => this.compat.sendMessage(user, input),
      ViewMessage: () => this.compat.viewMessage(user, input),
      SeenMessage: () => this.compat.seenMessage(user, input),
      DeleteMessage: () => this.compat.deleteMessage(user, input),
      InboxMessages: () => this.compat.inbox(user, input),
      SentMessages: () => this.compat.sent(user, input),
      AppServices: () => this.compat.appServices(user),
      Get_lawa2h_list: () => this.compat.laws(user, input),
      SeenLayha: () => this.compat.seenLaw(user, input),
      Months_List: () => this.compat.months(),
      Get_mosalat_list: () => this.compat.correspondence(user, input),
      Add_mosala_response: () => this.compat.answerCorrespondence(user, input),
      Ntaqat_types: () => this.compat.ranges(),
      Get_emp_ntaq: () => this.compat.employeeRange(user),
      Talabat_types: () => this.compat.requestTypes(),
      Get_emp_ehsaeyat: () => this.compat.statistics(),
      Get_mangar_ehsaeyat: () => this.compat.statistics(),
      Add_Talab: () => this.compat.addRequest(user, input),
      Get_Talabat_List: () => this.compat.requests(user, input),
      Get_Talab_data: () => this.compat.requests(user, input, true),
      Delete_Talab_order: () => this.compat.deleteRequest(user, input),
      Add_Mobadra: () => this.compat.addInitiative(user, input),
      Get_Mobadarat_List: () => this.compat.initiatives(user, input),
      Delete_Mobadra: () => this.compat.deleteInitiative(user, input),
      add_nashat: () => this.compat.addActivity(user, input),
      Get_Nashat_List: () => this.compat.activities(user, input),
      Delete_Nashat: () => this.compat.deleteActivity(user, input),
      Add_location_basma: () => this.compat.addLocation(user, input),
      get_employee_visits: () => this.compat.locations(user, input),
      Delete_zeyara: () => this.compat.deleteLocation(user, input),
      Report_hours_edafi: () => this.compat.overtime(user, input),
      report_tabdel_sheft: () => this.compat.shiftChanges(user, input),
      All_sliders: () => this.compat.slides(),
      get_branches: () => this.compat.branches(),
      insert_update_token: async () => {
        const token = this.value(input, 'device_token', 'token');
        if (!token) throw new HttpException('رمز الجهاز مطلوب', 400);
        return this.mobile.setDeviceToken(user, token);
      },
      update_pass: () => this.compat.updatePassword(user, input),
      update_pass_past: () => this.compat.updatePassword(user, input, true),
      update_profile_image: () => this.compat.updateProfileImage(user, input),
      Add_signature: () => this.compat.updateProfileImage(user, input, true),
      show_screen_alert: async () => ({ show_screen: 'no' }),
      Alert_Screen: () => this.compat.alertScreen(),
      Add_Screen_action: () => this.compat.acceptAlert(user, input),
      Report_Basma: async () => {
        const identity = await this.compat.identity(user);
        const dto = Object.assign(new AttendanceReportDto(), this.page(input), {
          empCode: String(identity.empCode),
          dateFrom: this.value(input, 'date_from', 'from_date', 'dateFrom'),
          dateTo: this.value(input, 'date_to', 'to_date', 'dateTo'),
          branchId: identity.branchId ? String(identity.branchId) : undefined,
        });
        return this.attendance.basmaReport(dto);
      },
      Basma_Today: async () => {
        const identity = await this.compat.identity(user);
        const today = new Date().toISOString().slice(0, 10);
        const dto = Object.assign(new AttendanceReportDto(), this.page(input), {
          empCode: String(identity.empCode), dateFrom: today, dateTo: today,
          branchId: identity.branchId ? String(identity.branchId) : undefined,
        });
        return this.attendance.basmaReport(dto);
      },
      sheft_types: async () => [
        { id: '1', title: 'تبديل شفت' },
        { id: '2', title: 'إضافة شفت' },
      ],
      dwam_types: () => this.attendance.listShifts(this.page(input)),
      add_sheft_edafi: async () => {
        const identity = await this.compat.identity(user);
        return this.attendance.createShiftSwap({
          empId: identity.id,
          ttype: this.id(input, 'ttype', 'sheft_type_id'),
          dwamIdFk: this.id(input, 'dwam_id_fk', 'dwam_id'),
          sheftDate: this.value(input, 'sheft_date', 'date') ?? '',
        }, user.sub);
      },
      add_hours_edafi: async () => {
        const identity = await this.compat.identity(user);
        return this.attendance.createExtraHours({
          empId: identity.id,
          numHours: this.id(input, 'num_hours'),
          edafaDate: this.value(input, 'edafa_date', 'date') ?? '',
        }, user.sub);
      },
    };
    const operation = operations[action];
    if (!operation) {
      return Promise.resolve({
        status: 400,
        message: `مسار التطبيق القديم غير مدعوم: ${action}`,
        data: null,
      });
    }
    return this.legacy(operation);
  }
}
