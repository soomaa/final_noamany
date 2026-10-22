import type { Request } from 'express';
export const SIDEBAR_API_POLICIES: Record<string, string[]> = {
  "FinanceReportsController.dailyClosing": [
    "financial-reports.daily_closing:view"
  ],
  "FinanceReportsController.targetReport": [
    "financial-reports.target:view"
  ],
  "ClubInbodyMeasurementsController.list": [
    "club.members.measurements:view"
  ],
  "ClubInbodyMeasurementsController.nextFileNumber": [
    "club.members.measurements:view"
  ],
  "ClubInbodyMeasurementsController.findOne": [
    "club.members.measurements:view"
  ],
  "ClubInbodyMeasurementsController.create": [
    "club.members.measurements:create"
  ],
  "ClubInbodyMeasurementsController.update": [
    "club.members.measurements:update"
  ],
  "ClubInbodyMeasurementsController.remove": [
    "club.members.measurements:delete"
  ],
  "AdminInbodyController.create": [
    "club.members.measurements:create"
  ],
  "ClubLockersController.inventoryReports": [
    "club.lockers.inventory:view",
    "club.lockers.inventory_reports:view"
  ],
  "ClubLockersController.createInventoryReport": [
    "club.lockers.inventory:create"
  ],
  "ClubLockersController.updateInventoryReport": [
    "club.lockers.inventory:update"
  ],
  "ClubLockersController.deleteInventoryReport": [
    "club.lockers.inventory:update"
  ],
  "ClubLockersController.listLockers": [
    "club.lockers.list:view",
    "club.lockers.new:view",
    "club.lockers.inventory:view"
  ],
  "ClubLockersController.statistics": [
    "club.lockers.list:view",
    "club.lockers.new:view"
  ],
  "ClubLockersController.lockerDetails": [
    "club.lockers.list:view",
    "club.lockers.new:view"
  ],
  "ClubLockersController.createLocker": [
    "club.lockers.new:create"
  ],
  "ClubLockersController.updateLocker": [
    "club.lockers.new:update"
  ],
  "ClubLockersController.removeLocker": [
    "club.lockers.new:delete"
  ],
  "ClubLockerTypesController.list": [
    "club.lockers.settings:view",
    "club.lockers.list:view"
  ],
  "ClubLockerTypesController.listAll": [
    "club.lockers.settings:view",
    "club.lockers.list:view"
  ],
  "ClubLockerTypesController.create": [
    "club.lockers.settings:update"
  ],
  "ClubLockerTypesController.update": [
    "club.lockers.settings:update"
  ],
  "ClubLockerTypesController.remove": [
    "club.lockers.settings:update"
  ],
  "ClubLockerSubscriptionsController.list": [
    "club.lockers.list:view"
  ],
  "ClubLockerSubscriptionsController.create": [
    "club.lockers.list:create"
  ],
  "ClubLockerSubscriptionsController.update": [
    "club.lockers.list:update"
  ],
  "ClubLockerSubscriptionsController.remove": [
    "club.lockers.list:delete"
  ],
  "ClubLockerSubscriptionsController.release": [
    "club.lockers.list:update"
  ],
  "ClubLockerSubscriptionsController.freeze": [
    "club.lockers.list:update"
  ],
  "ClubLockerSubscriptionsController.unfreeze": [
    "club.lockers.list:update"
  ],
  "ClubAttendanceController.memberOverview": [
    "club.members:view",
    "club.members.attendance:view",
    "club.reception:view",
    "club.reception.quick_services:view",
    "club.fitness:view",
    "club.members.barcode.member_check_in:view",
    "club.members.barcode.spa_check_in:view",
    "club.members.barcode.classes_check_in:view"
  ],
  "ClubAttendanceController.checkIn": [
    "club.members.attendance:create",
    "club.reception:create",
    "club.members.barcode.member_check_in:create"
  ],
  "ClubAttendanceController.checkOut": [
    "club.members.attendance:update",
    "club.reception:update",
    "club.members.barcode.member_check_in:update"
  ],
  "ClubAttendanceController.barcodeReport": [
    "club.members:view",
    "club.members.attendance:view",
    "club.reception:view",
    "club.members.barcode.member_check_in:view",
    "club.members.barcode.spa_attendance:view",
    "club.members.barcode.classes_attendance:view",
    "club.fitness:view",
    "club.subscriptions.special:view"
  ],
  "ClubAttendanceController.deleteBarcodeReportRow": [
    "club.members.attendance:delete",
    "club.members.barcode.member_check_in:delete",
    "club.members.barcode.spa_check_in:delete",
    "club.members.barcode.classes_check_in:delete",
    "club.fitness:delete"
  ],
  "ClubSpaAttendanceController.list": [
    "club.members.barcode.spa_attendance:view",
    "club.members.barcode.spa_check_in:view",
    "club.fitness.spa_invoices:view"
  ],
  "ClubSpaAttendanceController.barcodeCheckIn": [
    "club.members.barcode.spa_check_in:create"
  ],
  "ClubSpaInvoicesController.barcodeCheckIn": [
    "club.members.barcode.spa_check_in:create"
  ],
  "ClubClassesController.attendanceReport": [
    "club.members.barcode.classes_attendance:view",
    "club.members.barcode.classes_check_in:view",
    "club.subscriptions.special:view"
  ],
  "ClubClassesController.barcodeCheckInCurrent": [
    "club.members.barcode.classes_check_in:create"
  ],
  "ClubClassesController.barcodeCheckIn": [
    "club.members.barcode.classes_check_in:create"
  ],
  "ClubClassTypesController.list": [
    "club.subscriptions.special:view",
    "club.members.barcode.classes_attendance:view",
    "club.members.barcode.classes_check_in:view"
  ],
  "ClubClassTypesController.findOne": [
    "club.subscriptions.special:view",
    "club.members.barcode.classes_attendance:view",
    "club.members.barcode.classes_check_in:view"
  ],
  "ClubMembersController.barcodeRange": [
    "club.members.barcode_management:view",
    "club.members.barcode.print_range:view"
  ],
  "ClubMembersController.barcodePreview": [
    "club.members.barcode_management:view",
    "club.members.barcode.print_range:view"
  ],
  "ClubMembersController.list": [
    "club.members:view",
    "club.reception:view",
    "club.members.barcode_management:view",
    "club.members.barcode.print_range:view"
  ],
  "ClubMembersController.lookup": [
    "club.members:view",
    "club.subscriptions:view",
    "club.subscriptions.member_transfer:view",
    "club.subscriptions.member_transfer:create",
    "club.reception:view",
    "club.members.measurements:view",
    "club.discount_codes.member_grants:view"
  ],
  "ClubMembersController.measurementOperationLookup": [
    "club.members.measurements:view",
    "club.members.measurements:create",
    "club.members.measurements:update"
  ],
  "ClubMembersController.measurementOperationMember": [
    "club.members.measurements:view",
    "club.members.measurements:create",
    "club.members.measurements:update"
  ],
  "ClubMembersController.selectOptions": [
    "club.members:view",
    "club.subscriptions:view",
    "club.reception:view",
    "club.members.measurements:view",
    "club.discount_codes.member_grants:view"
  ],
  "ClubMembersController.findOne": [
    "club.members:view",
    "club.subscriptions:view",
    "club.subscriptions.member_transfer:view",
    "club.subscriptions.member_transfer:create",
    "club.reception:view",
    "club.members.measurements:view",
    "club.discount_codes.member_grants:view"
  ],
  "OnlineSubscriptionsController.list": [
    "club.subscriptions.online:view"
  ],
  "OnlineSubscriptionsController.approve": [
    "club.subscriptions.online:update"
  ],
  "OnlineSubscriptionsController.reject": [
    "club.subscriptions.online:update"
  ],
  "ClubPointsController.settings": [
    "club.points.earn_settings:view",
    "club.points.conversion_settings:view"
  ],
  "ClubPointsController.saveConversion": [
    "club.points.conversion_settings:update"
  ],
  "ClubPointsController.saveEarnSetting": [
    "club.points.earn_settings:update"
  ],
  "ClubPointsController.updateEarnSetting": [
    "club.points.earn_settings:update"
  ],
  "ClubPointsController.deleteEarnSetting": [
    "club.points.earn_settings:update"
  ],
  "ClubPointsController.historyByMemberCode": [
    "club.points.member_history:view"
  ],
  "ClubPointsController.history": [
    "club.points.member_history:view"
  ],
  "ClubPointsController.account": [
    "club.points.member_history:view",
    "club.members:view",
    "club.subscriptions:view",
    "club.subscriptions.list:view",
    "club.subscriptions.new:view"
  ],
  "ClubPointsController.earnedMembersReport": [
    "club.points.earned_report:view"
  ],
  "ClubPointsController.activeMembersReport": [
    "club.points.active_members_report:view"
  ],
  "ClubDiscountCodesController.list": [
    "club.discount_codes.create:view",
    "club.discount_codes.captain_allocations:view",
    "club.discount_codes.member_grants:view",
    "club.subscriptions:view",
    "club.lockers:view"
  ],
  "ClubDiscountCodesController.employeeAssignments": [
    "club.discount_codes.captain_allocations:view",
    "club.discount_codes.captain_codes:view",
    "club.discount_codes.member_grants:view"
  ],
  "ClubDiscountCodesController.memberGrants": [
    "club.discount_codes.member_grants:view",
    "club.discount_codes.member_report:view",
    "club.subscriptions:view",
    "club.subscriptions.list:view",
    "club.subscriptions.new:view"
  ],
  "ClubDiscountCodesController.memberGrantsByMemberCode": [
    "club.discount_codes.member_search:view",
    "club.discount_codes.member_report:view"
  ],
  "ClubDiscountCodesController.findMemberForGrant": [
    "club.discount_codes.member_grants:view"
  ],
  "ClubDiscountCodesController.usageReport": [
    "club.discount_codes.usage_report:view"
  ],
  "ClubDiscountCodesController.create": [
    "club.discount_codes.create:create"
  ],
  "ClubDiscountCodesController.update": [
    "club.discount_codes.create:update"
  ],
  "ClubDiscountCodesController.deleteEmployeeAssignments": [
    "club.discount_codes.captain_allocations:delete"
  ],
  "ClubDiscountCodesController.deactivate": [
    "club.discount_codes.create:delete"
  ],
  "ClubDiscountCodesController.assignToEmployee": [
    "club.discount_codes.captain_allocations:create"
  ],
  "ClubDiscountCodesController.assignManyToEmployee": [
    "club.discount_codes.captain_allocations:create"
  ],
  "ClubDiscountCodesController.replaceEmployeeAssignments": [
    "club.discount_codes.captain_allocations:update"
  ],
  "ClubDiscountCodesController.grantToMember": [
    "club.discount_codes.member_grants:create"
  ],
  "AttendanceController.basmaReport": [
    "attendance.reports:view"
  ],
  "AttendanceController.fullAttendanceSheet": [
    "attendance.reports:view"
  ],
  "AttendanceController.lateReport": [
    "attendance.reports:view"
  ],
  "AttendanceController.absenceReport": [
    "attendance.reports:view"
  ],
  "AttendanceController.overtimeReport": [
    "attendance.reports:view"
  ],
  "AttendanceController.shiftSwapReport": [
    "attendance.reports:view"
  ],
  "AttendanceController.listShiftSwaps": [
    "attendance.adjustments:view"
  ],
  "AttendanceController.listExtraHours": [
    "attendance.adjustments:view"
  ],
  "AttendanceController.createShiftSwap": [
    "attendance.adjustments:create"
  ],
  "AttendanceController.createExtraHours": [
    "attendance.adjustments:create"
  ],
  "AttendanceController.removeShiftSwap": [
    "attendance.adjustments:delete"
  ],
  "AttendanceController.removeExtraHours": [
    "attendance.adjustments:delete"
  ],
  "AttendanceController.getRules": [
    "attendance.rules:view"
  ],
  "AttendanceController.patchRules": [
    "attendance.rules:update"
  ],
  "AttendanceController.getSettings": [
    "attendance.settings:view"
  ],
  "AttendanceController.getWeeklyScheduleRollout": [
    "attendance.settings:view"
  ],
  "AttendanceController.patchSettings": [
    "attendance.settings:update"
  ],
  "AttendanceController.activateWeeklyScheduleRollout": [
    "attendance.settings:update"
  ],
  "AttendanceController.listDevices": [
    "attendance.devices:view"
  ],
  "AttendanceController.createDevice": [
    "attendance.devices:create"
  ],
  "AttendanceController.syncAll": [
    "attendance.devices:update"
  ],
  "AttendanceController.syncDevice": [
    "attendance.devices:update"
  ],
  "AttendanceController.removeDevice": [
    "attendance.devices:delete"
  ],
  "AttendanceController.board": [
    "attendance.board:view"
  ],
  "AttendanceController.manualOptions": [
    "attendance.board:view"
  ],
  "AttendanceController.manualCheck": [
    "attendance.board:update"
  ],
  "AttendanceController.importDeviceFile": [
    "attendance.import:create"
  ],
  "AttendanceController.listShifts": [
    "attendance.settings:view",
    "attendance.adjustments:view",
    "attendance.board:view"
  ],
  "AttendanceController.createShift": [
    "attendance.settings:update"
  ],
  "AttendanceController.updateShift": [
    "attendance.settings:update"
  ],
  "AttendanceController.removeShift": [
    "attendance.settings:update"
  ],
  "OrgController.findAll": [
    "hr.organization.departments:view",
    "org.departments:view"
  ],
  "OrgController.tree": [
    "hr.organization.departments:view",
    "org.departments:view"
  ],
  "OrgController.jobTitles": [
    "hr.organization.departments:view",
    "org.departments:view"
  ],
  "OrgController.create": [
    "hr.organization.departments:create"
  ],
  "OrgController.update": [
    "hr.organization.departments:update"
  ],
  "OrgController.remove": [
    "hr.organization.departments:delete"
  ],
  "HrWarningsController.listTemplates": [
    "affairs.warnings.templates:view",
    "affairs.warnings:view"
  ],
  "HrWarningsController.createTemplate": [
    "affairs.warnings.templates:update"
  ],
  "HrWarningsController.updateTemplate": [
    "affairs.warnings.templates:update"
  ],
  "HrWarningsController.removeTemplate": [
    "affairs.warnings.templates:update"
  ],
  "ClubBranchGroupsAdminController.list": [
    "org.branch_groups:view"
  ],
  "ClubBranchGroupsAdminController.create": [
    "org.branch_groups:create"
  ],
  "ClubBranchGroupsAdminController.update": [
    "org.branch_groups:update"
  ],
  "ClubBranchGroupsAdminController.remove": [
    "org.branch_groups:delete"
  ],
  "EmployeesController.posOptions": [
    "employees.list:view",
    "employees.new:view",
    "employees.weekly_leaves:view",
    "admin.users:view",
    "club.lockers.inventory:view",
    "club.discount_codes.captain_allocations:view",
    "club.discount_codes.member_grants:view",
    "attendance.reports:view",
    "attendance.adjustments:view",
    "gym-sales.sales.new_receipt:view",
    "gym-sales.sales.treasury:view",
    "gym-sales.sales.settlements:view",
    "payroll.increases:view",
    "payroll.increases_report:view",
    "leaves.permissions:view",
    "leaves.missions:view",
    "finance.loans:view",
    "finance.penalties:view",
    "affairs.circulars:view",
    "affairs.warnings:view",
    "affairs.evaluations:view",
    "affairs.custody:view",
    "affairs.messages:view",
    "affairs.daily_reports:view",
    "affairs.initiatives:view",
    "affairs.activities:view",
    "affairs.action_screen:view",
    "termination.archive:view",
    "club.fitness.trainers:view"
  ],
  "ClubOpsController.branchOptions": [
    "hr.hub:view",
    "employees.list:view",
    "employees.new:view",
    "employees.weekly_leaves:view",
    "attendance.board:view",
    "attendance.settings:view",
    "attendance.rules:view",
    "attendance.reports:view",
    "attendance.adjustments:view",
    "attendance.import:view",
    "payroll.runs:view",
    "payroll.increases:view",
    "payroll.increases_report:view",
    "payroll.pay_components:view",
    "leaves.list:view",
    "leaves.types:view",
    "leaves.balances:view",
    "leaves.permissions:view",
    "leaves.missions:view",
    "finance.loans:view",
    "finance.loan_settings:view",
    "finance.rewards:view",
    "finance.penalties:view",
    "affairs.circulars:view",
    "affairs.warnings:view",
    "affairs.warnings.templates:view",
    "affairs.messages:view",
    "affairs.activities:view",
    "affairs.legal_files:view",
    "affairs.action_screen:view",
    "affairs.gym_rates:view",
    "hr.mobile-content:view",
    "termination.clearance:view",
    "termination.archive:view",
    "reports.hub:view",
    "hr.organization.departments:view",
    "evaluation-management.categories:view",
    "evaluation-management.items:view",
    "evaluation-management.add_evaluation:view",
    "evaluation-management.report:view",
    "evaluation-management.hub:view",
    "club.dashboard:view",
    "club.reception:view",
    "club.reception.quick_services:view",
    "club.members:view",
    "club.members.barcode_management:view",
    "club.members.barcode.member_check_in:view",
    "club.members.barcode.spa_check_in:view",
    "club.members.barcode.classes_check_in:view",
    "club.members.barcode.print_range:view",
    "club.members.barcode.spa_attendance:view",
    "club.members.barcode.classes_attendance:view",
    "club.members.attendance:view",
    "club.members.measurements:view",
    "club.points.earn_settings:view",
    "club.points.conversion_settings:view",
    "club.points.member_history:view",
    "club.points.earned_report:view",
    "club.points.active_members_report:view",
    "club.packages.settings:view",
    "club.subscriptions.list:view",
    "club.subscriptions.member_transfer:view",
    "club.subscriptions.new:view",
    "club.subscriptions.special:view",
    "club.subscriptions.daily_cashier:view",
    "club.subscriptions.user_analytics:view",
    "club.subscriptions.receipts:view",
    "club.fitness.spa_invoices:view",
    "club.fitness.inbody_invoices:view",
    "club.subscriptions.outstanding:view",
    "club.subscriptions.treasury:view",
    "club.subscriptions.unified_treasury:view",
    "club.subscriptions.refunds:view",
    "club.subscriptions.customer_sources:view",
    "club.subscriptions.online:view",
    "club.discount_codes.create:view",
    "club.discount_codes.captain_allocations:view",
    "club.discount_codes.member_grants:view",
    "club.discount_codes.member_search:view",
    "club.discount_codes.member_report:view",
    "club.discount_codes.captain_codes:view",
    "club.discount_codes.usage_report:view",
    "club.lockers.list:view",
    "club.lockers.new:view",
    "club.lockers.settings:view",
    "club.lockers.inventory:view",
    "club.lockers.inventory_reports:view",
    "club.fitness.trainers:view",
    "club.fitness.trainer_payments:view",
    "club.fitness.trainer_search:view",
    "club.fitness.trainer_ratings:view",
    "club.fitness.trainer_settings:view",
    "club.fitness.trainer_targets:view",
    "club.fitness.trainer_evaluations:view",
    "club.fitness.trainer_evaluation_criteria:view",
    "club.fitness.branch_analysis:view",
    "club.fitness.reception_analysis:view",
    "club.fitness.shift_analysis:view",
    "club.events.list:view",
    "club.events.registrations:view",
    "club.events.checkin:view",
    "club.events.settings:view",
    "financial-reports.dashboard:view",
    "financial-reports.expenses:view",
    "financial-reports.revenues:view",
    "financial-reports.reports:view",
    "financial-reports.revenue_reports:view",
    "financial-reports.analysis:view",
    "financial-reports.profit_loss:view",
    "financial-reports.daily_closing:view",
    "financial-reports.target:view",
    "gym-sales.sales.new_receipt:view",
    "gym-sales.sales.drafts:view",
    "gym-sales.sales.invoices:view",
    "gym-sales.sales.revenue:view",
    "gym-sales.sales.shifts:view",
    "gym-sales.sales.treasury:view",
    "gym-sales.sales.settlements:view",
    "gym-sales.sales.pos_admin:view",
    "club.cafe.categories:view",
    "club.cafe.products:view",
    "club.cafe.price_list:view",
    "club.cafe.reports:view",
    "club.cafe.feedback_reports:view",
    "gym-sales.inventory.dashboard:view",
    "gym-sales.inventory.raw_materials:view",
    "gym-sales.inventory.gym_issue:view",
    "gym-sales.inventory.stock_taking:view",
    "gym-sales.inventory.movement_log:view",
    "gym-sales.procurement.requisitions:view",
    "gym-sales.procurement.purchase_orders:view",
    "gym-sales.procurement.goods_receipts:view",
    "gym-sales.procurement.invoices:view",
    "gym-sales.procurement.returns:view",
    "gym-sales.procurement.dashboard:view",
    "gym-sales.procurement.settings:view",
    "accounting.hub:view",
    "accounting.payment_methods:view",
    "accounting.dashboard:view",
    "accounting.journal:view",
    "accounting.accounts:view",
    "accounting.reports.gl:view",
    "accounting.reports.statement:view",
    "accounting.reports:view",
    "accounting.reports.income:view",
    "accounting.reports.balance:view",
    "accounting.reports.cashflow:view",
    "accounting.settings:view",
    "portal-management.hub:view",
    "portal-management.company:view",
    "portal-management.sliders:view",
    "portal-management.partners:view",
    "portal-management.policies:view",
    "portal-management.about:view",
    "portal-management.photos:view",
    "portal-management.videos:view",
    "portal-management.hero-videos:view",
    "portal-management.branch-settings:view",
    "portal-management.trainers:view",
    "portal-management.classes:view",
    "portal-management.messages:view",
    "portal-management.messages-read:view",
    "portal-management.jobs-list:view",
    "portal-management.job-applications:view",
    "portal-management.job-applications-accepted:view",
    "portal-management.job-applications-rejected:view",
    "portal-management.badges:view",
    "portal-management.captain-discounts:view",
    "portal-management.categories:view",
    "portal-management.products:view",
    "portal-management.orders:view",
    "portal-management.customers:view",
    "portal-management.sales-report:view",
    "portal-management.offers:view",
    "portal-management.section-settings:view",
    "portal-management.stats:view",
    "portal-management.ticker:view",
    "portal-management.services:view",
    "portal-management.class-showcase:view",
    "portal-management.about-features:view",
    "portal-management.coach-features:view",
    "portal-management.membership-plans:view",
    "app-management.hub:view",
    "app-management.about:view",
    "app-management.invitations.sent:view",
    "app-management.invitations.accepted:view",
    "app-management.invitations.attended:view",
    "app-management.invitations.rejected:view",
    "app-management.offers:view",
    "app-management.trainers:view",
    "app-management.exercise-categories:view",
    "app-management.exercises:view",
    "app-management.news:view",
    "app-management.community:view",
    "app-management.ads:view",
    "admin.hub:view",
    "org.branches:view",
    "org.departments:view",
    "admin.roles:view",
    "admin.exceptions:view",
    "admin.users:view",
    "admin.audit:view",
    "admin.business-audit:view",
    "admin.automation:view",
    "admin.gym-policies:view",
    "admin.backup:view",
    "admin.webhooks:view",
    "admin.company:view",
    "admin.forms:view",
    "org.branch_groups:view",
    "customer-service.questions:view",
    "customer-service.feedback:view",
    "customer-service.reports:view",
    "customer-service.hub:view"
  ],
  "ClubTrainersController.list": [
    "club.fitness.trainers:view",
    "club.fitness.trainer_search:view",
    "club.fitness.trainer_payments:view",
    "club.fitness.trainer_ratings:view",
    "club.fitness.personal_sessions:view",
    "club.subscriptions.special:view"
  ],
  "ClubTrainersController.statistics": [
    "club.fitness.trainers:view",
    "club.fitness.trainer_search:view",
    "club.fitness.trainer_payments:view",
    "club.fitness.trainer_ratings:view",
    "club.fitness.personal_sessions:view",
    "club.subscriptions.special:view"
  ],
  "ClubTrainersController.findOne": [
    "club.fitness.trainers:view",
    "club.fitness.trainer_search:view",
    "club.fitness.trainer_payments:view",
    "club.fitness.trainer_ratings:view",
    "club.fitness.personal_sessions:view",
    "club.subscriptions.special:view"
  ],
  "ClubTrainersController.details": [
    "club.fitness.trainers:view",
    "club.fitness.trainer_search:view",
    "club.fitness.trainer_payments:view",
    "club.fitness.trainer_ratings:view",
    "club.fitness.personal_sessions:view",
    "club.subscriptions.special:view"
  ],
  "ClubTrainersController.listRatings": [
    "club.fitness.trainer_ratings:view",
    "club.fitness.trainers:view",
    "club.fitness.trainer_search:view"
  ],
  "ClubTrainersController.create": [
    "club.fitness.trainers:create",
    "club.subscriptions.special:create"
  ],
  "ClubTrainersController.createExternal": [
    "club.fitness.trainers:create",
    "club.subscriptions.special:create"
  ],
  "ClubTrainersController.update": [
    "club.fitness.trainers:update",
    "club.subscriptions.special:update"
  ],
  "ClubTrainersController.remove": [
    "club.fitness.trainers:delete",
    "club.subscriptions.special:delete"
  ],
  "ClubTrainersController.addRating": [
    "club.fitness.trainer_ratings:create"
  ],
  "ClubTrainersController.defaultSchedule": [
    "club.fitness.trainer_settings:view",
    "club.subscriptions.special:view"
  ],
  "ClubTrainersController.replaceDefaultSchedule": [
    "club.fitness.trainer_settings:update",
    "club.subscriptions.special:update"
  ],
  "TrainerPerformanceController.trainers": [
    "club.fitness.trainers:view",
    "club.fitness.trainer_targets:view",
    "club.fitness.trainer_evaluations:view",
    "club.fitness.trainer_search:view"
  ],
  "TrainerPerformanceController.criteria": [
    "club.fitness.trainer_evaluation_criteria:view",
    "club.fitness.trainer_evaluations:view"
  ],
  "ClubHallsController.statistics": [
    "club.fitness.room_bookings:view",
    "club.fitness.personal_sessions:view",
    "club.subscriptions.special:view"
  ],
  "ClubHallsController.list": [
    "club.fitness.room_bookings:view",
    "club.fitness.personal_sessions:view",
    "club.subscriptions.special:view"
  ],
  "ClubHallsController.findOne": [
    "club.fitness.room_bookings:view",
    "club.fitness.personal_sessions:view",
    "club.subscriptions.special:view"
  ],
  "ClubHallsController.create": [
    "club.fitness.room_bookings:create"
  ],
  "ClubHallsController.update": [
    "club.fitness.room_bookings:update"
  ],
  "ClubHallsController.remove": [
    "club.fitness.room_bookings:delete"
  ],
  "ClubClassesController.list": [
    "club.subscriptions.special:view",
    "club.fitness.personal_sessions:view"
  ],
  "ClubClassesController.statistics": [
    "club.subscriptions.special:view",
    "club.fitness.personal_sessions:view"
  ],
  "ClubClassesController.managementReports": [
    "club.subscriptions.special:view",
    "club.fitness.personal_sessions:view"
  ],
  "ClubClassesController.generateDefault": [
    "club.subscriptions.special:create",
    "club.fitness.personal_sessions:create"
  ],
  "ClubClassesController.findOne": [
    "club.subscriptions.special:view",
    "club.fitness.personal_sessions:view"
  ],
  "ClubClassesController.create": [
    "club.subscriptions.special:create",
    "club.fitness.personal_sessions:create"
  ],
  "ClubClassesController.update": [
    "club.subscriptions.special:update",
    "club.fitness.personal_sessions:update"
  ],
  "ClubClassesController.remove": [
    "club.subscriptions.special:delete",
    "club.fitness.personal_sessions:delete"
  ],
  "ClubClassesController.enroll": [
    "club.subscriptions.special:create",
    "club.fitness.personal_sessions:create"
  ],
  "ClubClassesController.receptionCheckIn": [
    "club.subscriptions.special:update",
    "club.fitness.personal_sessions:update"
  ],
  "ClubClassesController.waitlist": [
    "club.subscriptions.special:view",
    "club.fitness.personal_sessions:view"
  ],
  "ClubClassesController.removeWaitlist": [
    "club.subscriptions.special:delete",
    "club.fitness.personal_sessions:delete"
  ],
  "ClubClassesController.unenroll": [
    "club.subscriptions.special:delete",
    "club.fitness.personal_sessions:delete"
  ],
  "ClubClassesController.attendance": [
    "club.subscriptions.special:update",
    "club.fitness.personal_sessions:update"
  ],
  "ClubCustomerSourcesController.list": [
    "club.subscriptions.customer_sources:view"
  ],
  "ClubCustomerSourcesController.create": [
    "club.subscriptions.customer_sources:create"
  ],
  "ClubCustomerSourcesController.update": [
    "club.subscriptions.customer_sources:update"
  ],
  "ClubCustomerSourcesController.remove": [
    "club.subscriptions.customer_sources:delete"
  ],
  "ClubReceiptsController.create": [
    "club.subscriptions.receipts:create"
  ],
  "ClubReceiptsController.update": [
    "club.subscriptions.receipts:update"
  ],
  "RequisitionsController.list": [
    "gym-sales.procurement.requisitions:view"
  ],
  "RequisitionsController.findOne": [
    "gym-sales.procurement.requisitions:view"
  ],
  "RequisitionsController.create": [
    "gym-sales.procurement.requisitions:create"
  ],
  "RequisitionsController.update": [
    "gym-sales.procurement.requisitions:update"
  ],
  "RequisitionsController.remove": [
    "gym-sales.procurement.requisitions:delete"
  ],
  "RequisitionsController.addItem": [
    "gym-sales.procurement.requisitions:update"
  ],
  "RequisitionsController.submit": [
    "gym-sales.procurement.requisitions:update"
  ],
  "PurchaseOrdersController.list": [
    "gym-sales.procurement.purchase_orders:view"
  ],
  "PurchaseOrdersController.findOne": [
    "gym-sales.procurement.purchase_orders:view"
  ],
  "PurchaseOrdersController.create": [
    "gym-sales.procurement.purchase_orders:create"
  ],
  "PurchaseOrdersController.update": [
    "gym-sales.procurement.purchase_orders:update"
  ],
  "PurchaseOrdersController.remove": [
    "gym-sales.procurement.purchase_orders:delete"
  ],
  "GoodsReceiptsController.list": [
    "gym-sales.procurement.goods_receipts:view"
  ],
  "GoodsReceiptsController.findOne": [
    "gym-sales.procurement.goods_receipts:view"
  ],
  "GoodsReceiptsController.create": [
    "gym-sales.procurement.goods_receipts:create"
  ],
  "GoodsReceiptsController.update": [
    "gym-sales.procurement.goods_receipts:update"
  ],
  "GoodsReceiptsController.changeStatus": [
    "gym-sales.procurement.goods_receipts:approve"
  ],
  "GoodsReceiptsController.remove": [
    "gym-sales.procurement.goods_receipts:delete"
  ],
  "PurchaseInvoicesController.list": [
    "gym-sales.procurement.invoices:view"
  ],
  "PurchaseInvoicesController.findOne": [
    "gym-sales.procurement.invoices:view"
  ],
  "PurchaseInvoicesController.create": [
    "gym-sales.procurement.invoices:create"
  ],
  "PurchaseInvoicesController.update": [
    "gym-sales.procurement.invoices:update"
  ],
  "PurchaseInvoicesController.remove": [
    "gym-sales.procurement.invoices:delete"
  ],
  "PurchaseInvoicesController.match": [
    "gym-sales.procurement.invoices:approve"
  ],
  "PurchaseReturnsController.list": [
    "gym-sales.procurement.returns:view"
  ],
  "PurchaseReturnsController.findOne": [
    "gym-sales.procurement.returns:view"
  ],
  "PurchaseReturnsController.create": [
    "gym-sales.procurement.returns:create"
  ],
  "PurchaseReturnsController.update": [
    "gym-sales.procurement.returns:update"
  ],
  "PurchaseReturnsController.changeStatus": [
    "gym-sales.procurement.returns:approve"
  ],
  "PurchaseReturnsController.remove": [
    "gym-sales.procurement.returns:delete"
  ],
  "SupplierDashboardController.stats": [
    "gym-sales.procurement.dashboard:view"
  ],
  "SupplierDashboardController.top": [
    "gym-sales.procurement.dashboard:view"
  ],
  "SupplierDashboardController.activity": [
    "gym-sales.procurement.dashboard:view"
  ],
  "SupplierDashboardController.performance": [
    "gym-sales.procurement.dashboard:view"
  ],
  "SupplierDashboardController.alerts": [
    "gym-sales.procurement.dashboard:view"
  ],
  "SupplierDashboardController.exportSuppliers": [
    "gym-sales.procurement.dashboard:export"
  ],
  "ProcurementSettingsController.get": [
    "gym-sales.procurement.settings:view"
  ],
  "ProcurementSettingsController.update": [
    "gym-sales.procurement.settings:update"
  ],
  "StockController.list": [
    "gym-sales.inventory.dashboard:view",
    "gym-sales.inventory.raw_materials:view",
    "gym-sales.inventory.stock_taking:view",
    "gym-sales.inventory.gym_issue:view"
  ],
  "StockController.levels": [
    "gym-sales.inventory.dashboard:view",
    "gym-sales.inventory.raw_materials:view",
    "gym-sales.inventory.stock_taking:view",
    "gym-sales.inventory.gym_issue:view"
  ],
  "StockController.byProductWarehouse": [
    "gym-sales.inventory.dashboard:view",
    "gym-sales.inventory.raw_materials:view",
    "gym-sales.inventory.stock_taking:view",
    "gym-sales.inventory.gym_issue:view"
  ],
  "StockController.lowStock": [
    "gym-sales.inventory.dashboard:view"
  ],
  "StockController.updateProductWarehouse": [
    "gym-sales.inventory.raw_materials:update"
  ],
  "StockController.updateSettings": [
    "gym-sales.inventory.raw_materials:update"
  ],
  "ProcurementLookupController.search": [
    "gym-sales.procurement.requisitions:view",
    "gym-sales.procurement.purchase_orders:view",
    "gym-sales.procurement.goods_receipts:view",
    "gym-sales.procurement.invoices:view",
    "gym-sales.procurement.returns:view",
    "gym-sales.procurement.dashboard:view",
    "gym-sales.procurement.settings:view"
  ],
  "SupplierSettingsController.listCategories": [
    "gym-sales.procurement.settings:view",
    "gym-sales.procurement.suppliers:view",
    "gym-sales.procurement.cafe_purchases:view"
  ],
  "SupplierSettingsController.listActiveCategories": [
    "gym-sales.procurement.settings:view",
    "gym-sales.procurement.suppliers:view",
    "gym-sales.procurement.cafe_purchases:view"
  ],
  "SupplierSettingsController.findCategory": [
    "gym-sales.procurement.settings:view",
    "gym-sales.procurement.suppliers:view",
    "gym-sales.procurement.cafe_purchases:view"
  ],
  "SupplierSettingsController.createCategory": [
    "gym-sales.procurement.settings:update"
  ],
  "SupplierSettingsController.updateCategory": [
    "gym-sales.procurement.settings:update"
  ],
  "SupplierSettingsController.removeCategory": [
    "gym-sales.procurement.settings:update"
  ],
  "SupplierSettingsController.listRegions": [
    "gym-sales.procurement.settings:view",
    "gym-sales.procurement.suppliers:view",
    "gym-sales.procurement.cafe_purchases:view"
  ],
  "SupplierSettingsController.listActiveRegions": [
    "gym-sales.procurement.settings:view",
    "gym-sales.procurement.suppliers:view",
    "gym-sales.procurement.cafe_purchases:view"
  ],
  "SupplierSettingsController.findRegion": [
    "gym-sales.procurement.settings:view",
    "gym-sales.procurement.suppliers:view",
    "gym-sales.procurement.cafe_purchases:view"
  ],
  "SupplierSettingsController.createRegion": [
    "gym-sales.procurement.settings:update"
  ],
  "SupplierSettingsController.updateRegion": [
    "gym-sales.procurement.settings:update"
  ],
  "SupplierSettingsController.removeRegion": [
    "gym-sales.procurement.settings:update"
  ],
  "SupplierSettingsController.listPaymentTerms": [
    "gym-sales.procurement.settings:view",
    "gym-sales.procurement.suppliers:view",
    "gym-sales.procurement.cafe_purchases:view"
  ],
  "SupplierSettingsController.listActivePaymentTerms": [
    "gym-sales.procurement.settings:view",
    "gym-sales.procurement.suppliers:view",
    "gym-sales.procurement.cafe_purchases:view"
  ],
  "SupplierSettingsController.findPaymentTerm": [
    "gym-sales.procurement.settings:view",
    "gym-sales.procurement.suppliers:view",
    "gym-sales.procurement.cafe_purchases:view"
  ],
  "SupplierSettingsController.createPaymentTerm": [
    "gym-sales.procurement.settings:update"
  ],
  "SupplierSettingsController.updatePaymentTerm": [
    "gym-sales.procurement.settings:update"
  ],
  "SupplierSettingsController.removePaymentTerm": [
    "gym-sales.procurement.settings:update"
  ],
  "PayrollController.listComponents": [
    "payroll.pay_components:view",
    "payroll.runs:view",
    "payroll.setup:view"
  ],
  "PayrollController.createComponent": [
    "payroll.pay_components:create"
  ],
  "PayrollController.updateComponent": [
    "payroll.pay_components:update"
  ],
  "PayrollController.removeComponent": [
    "payroll.pay_components:delete"
  ],
  "PayrollController.previewSalarySheet": [
    "payroll.runs:view"
  ],
  "PayrollController.listSalaryIncreases": [
    "payroll.increases:view",
    "payroll.increases_report:view"
  ],
  "PayrollController.createSalaryIncrease": [
    "payroll.increases:create"
  ],
  "PayrollController.updateSalaryIncrease": [
    "payroll.increases:update"
  ],
  "PayrollController.removeSalaryIncrease": [
    "payroll.increases:delete"
  ],
  "PayrollController.createRun": [
    "payroll.runs:create"
  ],
  "PayrollController.listRuns": [
    "payroll.runs:view"
  ],
  "PayrollController.listRunLines": [
    "payroll.runs:view"
  ],
  "PayrollController.getSlip": [
    "payroll.runs:view"
  ],
  "PayrollController.applySlipOverrides": [
    "payroll.runs:update"
  ],
  "PayrollController.getBankFile": [
    "payroll.runs:view"
  ],
  "PayrollController.runAction": [
    "payroll.runs:approve"
  ],
  "PayrollController.findRun": [
    "payroll.runs:view"
  ],
  "PayrollController.removeRun": [
    "payroll.runs:delete"
  ],
  "LeavesController.listTypes": [
    "leaves.types:view",
    "leaves.list:view",
    "leaves.balances:view"
  ],
  "LeavesController.createType": [
    "leaves.types:create"
  ],
  "LeavesController.updateType": [
    "leaves.types:update"
  ],
  "LeavesController.removeType": [
    "leaves.types:delete"
  ],
  "LeavesController.balances": [
    "leaves.balances:view"
  ],
  "LeavesController.carryOver": [
    "leaves.balances:update"
  ],
  "LeavesController.list": [
    "leaves.list:view"
  ],
  "LeavesController.create": [
    "leaves.list:create"
  ],
  "LeavesController.update": [
    "leaves.list:update"
  ],
  "LeavesController.cancel": [
    "leaves.list:update"
  ],
  "LeavesController.remove": [
    "leaves.list:delete"
  ],
  "LeavesController.available": [
    "leaves.list:view",
    "leaves.balances:view"
  ],
  "ClubFacilitiesController.list": [
    "club.fitness.facilities:view"
  ],
  "ClubFacilitiesController.findOne": [
    "club.fitness.facilities:view"
  ],
  "ClubFacilitiesController.create": [
    "club.fitness.facilities:create"
  ],
  "ClubFacilitiesController.update": [
    "club.fitness.facilities:update"
  ],
  "ClubFacilitiesController.remove": [
    "club.fitness.facilities:delete"
  ],
  "ClubEquipmentController.list": [
    "club.fitness.equipment:view"
  ],
  "ClubEquipmentController.findOne": [
    "club.fitness.equipment:view"
  ],
  "ClubEquipmentController.create": [
    "club.fitness.equipment:create"
  ],
  "ClubEquipmentController.update": [
    "club.fitness.equipment:update"
  ],
  "ClubEquipmentController.remove": [
    "club.fitness.equipment:delete"
  ],
  "ClubEquipmentMaintenanceController.list": [
    "club.fitness.equipment_maintenance:view"
  ],
  "ClubEquipmentMaintenanceController.findOne": [
    "club.fitness.equipment_maintenance:view"
  ],
  "ClubEquipmentMaintenanceController.create": [
    "club.fitness.equipment_maintenance:create"
  ],
  "ClubEquipmentMaintenanceController.update": [
    "club.fitness.equipment_maintenance:update"
  ],
  "ClubEquipmentMaintenanceController.remove": [
    "club.fitness.equipment_maintenance:delete"
  ],
  "ClubHallBookingsController.list": [
    "club.fitness.room_bookings:view"
  ],
  "ClubHallBookingsController.findOne": [
    "club.fitness.room_bookings:view"
  ],
  "ClubHallBookingsController.create": [
    "club.fitness.room_bookings:create"
  ],
  "ClubHallBookingsController.update": [
    "club.fitness.room_bookings:update"
  ],
  "ClubHallBookingsController.remove": [
    "club.fitness.room_bookings:delete"
  ],
  "ClubSpaServicesController.catalog": [
    "club.fitness.spa_services:view",
    "club.fitness.spa_bookings:view",
    "club.fitness.spa_invoices:view"
  ],
  "ClubSpaServicesController.list": [
    "club.fitness.spa_services:view",
    "club.fitness.spa_bookings:view",
    "club.fitness.spa_invoices:view"
  ],
  "ClubSpaServicesController.findOne": [
    "club.fitness.spa_services:view"
  ],
  "ClubSpaServicesController.create": [
    "club.fitness.spa_services:create"
  ],
  "ClubSpaServicesController.update": [
    "club.fitness.spa_services:update"
  ],
  "ClubSpaServicesController.remove": [
    "club.fitness.spa_services:delete"
  ],
  "ClubSpaBookingsController.list": [
    "club.fitness.spa_bookings:view"
  ],
  "ClubSpaBookingsController.findOne": [
    "club.fitness.spa_bookings:view"
  ],
  "ClubSpaBookingsController.create": [
    "club.fitness.spa_bookings:create"
  ],
  "ClubSpaBookingsController.update": [
    "club.fitness.spa_bookings:update"
  ],
  "ClubSpaBookingsController.remove": [
    "club.fitness.spa_bookings:delete"
  ],
  "ClubSpaInvoicesController.list": [
    "club.fitness.spa_invoices:view"
  ],
  "ClubSpaInvoicesController.benefits": [
    "club.fitness.spa_invoices:view",
    "club.members.barcode.spa_check_in:view"
  ],
  "ClubSpaInvoicesController.findOne": [
    "club.fitness.spa_invoices:view"
  ],
  "ClubSpaInvoicesController.create": [
    "club.fitness.spa_invoices:create"
  ],
  "ClubSpaInvoicesController.update": [
    "club.fitness.spa_invoices:update"
  ],
  "ClubSpaInvoicesController.remove": [
    "club.fitness.spa_invoices:delete"
  ],
  "ClubInbodyInvoicesController.list": [
    "club.fitness.inbody_invoices:view"
  ],
  "ClubInbodyInvoicesController.benefits": [
    "club.fitness.inbody_invoices:view",
    "club.members.measurements:view"
  ],
  "ClubInbodyInvoicesController.findOne": [
    "club.fitness.inbody_invoices:view"
  ],
  "ClubInbodyInvoicesController.create": [
    "club.fitness.inbody_invoices:create"
  ],
  "ClubInbodyInvoicesController.update": [
    "club.fitness.inbody_invoices:update"
  ],
  "ClubInbodyInvoicesController.remove": [
    "club.fitness.inbody_invoices:delete"
  ]
};
const PORTAL_PAGES: Record<string,string> = {"company":"portal-management.company","sliders":"portal-management.sliders","partners":"portal-management.partners","policies":"portal-management.policies","about":"portal-management.about","photos":"portal-management.photos","videos":"portal-management.videos","hero-videos":"portal-management.hero-videos","branches":"portal-management.branch-settings","trainers":"portal-management.trainers","classes":"portal-management.classes","messages":"portal-management.messages","messages-read":"portal-management.messages-read","jobs":"portal-management.jobs-list","job-applications":"portal-management.job-applications","job-applications-accepted":"portal-management.job-applications-accepted","job-applications-rejected":"portal-management.job-applications-rejected","badges":"portal-management.badges","captain-discounts":"portal-management.captain-discounts","categories":"portal-management.categories","products":"portal-management.products","orders":"portal-management.orders","customers":"portal-management.customers","captain-sales-report":"portal-management.sales-report","offers":"portal-management.offers","section-settings":"portal-management.section-settings","stats":"portal-management.stats","ticker":"portal-management.ticker","services":"portal-management.services","class-showcase":"portal-management.class-showcase","about-features":"portal-management.about-features","coach-features":"portal-management.coach-features","membership-plans":"portal-management.membership-plans"};
const SETTING_PAGES: Record<string,string> = {"company":"portal-management.company","about":"portal-management.about"};
const ACTIONS: Record<string,string[]> = {"hr":["view","create","update","delete","approve","reject","export","print","audit","configure"],"hr.hub":["view","export","print"],"employees":["view","create","update","delete","approve","reject","export","print","audit","configure"],"employees.list":["view","create","update","delete","export","print","audit"],"employees.new":["view","create","update","delete","export","print","audit"],"employees.documents":["view","create","update","delete","export","print","audit"],"employees.weekly_leaves":["view","create","update","delete","export","print","audit"],"hr.partners":["view","create","update","delete","export","print","audit"],"attendance":["view","create","update","delete","approve","reject","export","print","audit","configure"],"attendance.board":["view","update","export","print","audit"],"attendance.devices":["view","create","update","delete","export","print","audit"],"attendance.settings":["view","update","configure","audit"],"attendance.rules":["view","update","configure","audit"],"attendance.reports":["view","export","print"],"attendance.adjustments":["view","create","update","delete","audit"],"attendance.import":["view","create","execute","audit"],"payroll":["view","create","update","delete","approve","reject","export","print","audit","configure"],"payroll.runs":["view","create","update","delete","approve","reject","export","print","audit","execute"],"payroll.increases":["view","create","update","delete","export","print","audit"],"payroll.increases_report":["view","export","print"],"payroll.setup":["view","update","configure","audit"],"payroll.pay_components":["view","create","update","delete","export","print","audit"],"payroll.salary_scale":["view","create","update","delete","export","print","audit"],"leaves":["view","create","update","delete","approve","reject","export","print","audit","configure"],"leaves.list":["view","create","update","delete","approve","reject","export","print","audit"],"leaves.types":["view","create","update","delete","export","print","audit"],"leaves.balances":["view","update","export","print","audit"],"leaves.permissions":["view","create","update","delete","approve","reject","export","print","audit"],"leaves.requests":["view","create","update","delete","approve","reject","export","print","audit"],"leaves.missions":["view","create","update","delete","approve","reject","export","print","audit"],"finance":["view","create","update","delete","approve","reject","export","print","audit","configure"],"finance.loans":["view","create","update","delete","approve","reject","export","print","audit"],"finance.loan_settings":["view","update","configure","audit"],"administrative-decisions-actions":["view","create","update","delete","approve","reject","export","print","audit","configure"],"affairs.admin_decisions":["view","create","update","delete","export","print","audit"],"finance.rewards":["view","create","update","delete","approve","reject","export","print","audit"],"finance.penalties":["view","create","update","delete","approve","reject","export","print","audit"],"finance.penalties_bylaw":["view","update","configure","audit"],"affairs":["view","create","update","delete","approve","reject","export","print","audit","configure"],"affairs.circulars":["view","create","update","delete","export","print","audit"],"affairs.warnings":["view","create","update","delete","approve","reject","export","print","audit"],"affairs.warnings.templates":["view","update","configure","audit"],"affairs.evaluations":["view","create","update","delete","export","print","audit"],"affairs.custody":["view","create","update","delete","export","print","audit"],"affairs.job_requests":["view","create","update","delete","approve","reject","export","print","audit"],"affairs.messages":["view","create","update","delete","export","print","audit"],"affairs.tasks":["view","create","update","delete","export","print","audit"],"affairs.daily_reports":["view","create","update","delete","export","print","audit"],"affairs.initiatives":["view","create","update","delete","export","print","audit"],"affairs.activities":["view","create","update","delete","export","print","audit"],"affairs.legal_files":["view","create","update","delete","export","print","audit"],"affairs.site_visits":["view","create","update","delete","export","print","audit"],"affairs.action_screen":["view","execute","audit"],"affairs.gym_rates":["view","update","configure","audit"],"hr.mobile-content":["view","update","configure","audit"],"termination":["view","create","update","delete","approve","reject","export","print","audit","configure"],"termination.clearance":["view","create","update","delete","approve","reject","export","print","audit"],"termination.archive":["view","update","export","print","audit"],"reports":["view","export","print","audit","configure"],"reports.hub":["view","export","print"],"hr.organization.departments":["view","create","update","delete","export","print","audit"],"evaluation-management":["view","create","update","delete","approve","reject","export","print","audit","configure"],"evaluation-management.categories":["view","create","update","delete","export","print","audit"],"evaluation-management.items":["view","create","update","delete","export","print","audit"],"evaluation-management.add_evaluation":["view","create","update","delete","export","print","audit"],"evaluation-management.report":["view","create","update","delete","export","print","audit"],"evaluation-management.hub":["view","export","print"],"club":["view","create","update","delete","approve","reject","export","print","audit","configure"],"club.dashboard":["view","export","print"],"club.membership":["view","create","update","delete","approve","reject","export","print","audit","configure"],"club.reception":["view","create","update","delete","approve","reject","export","print","audit"],"club.reception.quick_services":["view","create","update","delete","export","print","audit"],"club.members":["view","create","update","delete","export","print","audit"],"club.members.barcode_management":["view","create","update","delete","export","print","audit"],"club.members.barcode.member_check_in":["view","create","update","delete","export","print","audit"],"club.members.barcode.spa_check_in":["view","create","update","delete","export","print","audit"],"club.members.barcode.classes_check_in":["view","create","update","delete","export","print","audit"],"club.members.barcode.print_range":["view","export","print"],"club.members.barcode.spa_attendance":["view","export","print"],"club.members.barcode.classes_attendance":["view","export","print"],"club.members.attendance":["view","create","update","delete","export","print","audit"],"club.members.groups":["view","create","update","delete","export","print","audit"],"club.members.surveys":["view","create","update","delete","export","print","audit"],"sales.portal":["view","update"],"club.members.measurements":["view","create","update","delete","export","print","audit"],"club.points.earn_settings":["view","update","configure","audit"],"club.points.conversion_settings":["view","update","configure","audit"],"club.points.member_history":["view","export","print"],"club.points.earned_report":["view","export","print"],"club.points.active_members_report":["view","export","print"],"club.subscriptions":["view","create","update","delete","approve","reject","export","print","audit","configure"],"club.packages.settings":["view","update","configure","audit"],"club.subscriptions.list":["view","create","update","delete","approve","reject","export","print","audit"],"club.subscriptions.new":["view","create","update","delete","approve","reject","export","print","audit"],"club.subscriptions.special":["view","create","update","delete","approve","reject","export","print","audit"],"club.subscriptions.daily_cashier":["view","export","print"],"club.subscriptions.user_analytics":["view","export","print"],"club.subscriptions.reports":["view","export","print"],"club.subscriptions.receipts":["view","create","update","delete","approve","reject","export","print","audit"],"club.fitness.spa_invoices":["view","create","update","delete","export","print","audit"],"club.fitness.inbody_invoices":["view","create","update","delete","export","print","audit"],"club.subscriptions.outstanding":["view","create","update","delete","approve","reject","export","print","audit"],"club.subscriptions.treasury":["view","create","update","delete","approve","reject","export","print","audit"],"club.subscriptions.unified_treasury":["view","create","update","delete","approve","reject","export","print","audit"],"club.subscriptions.refunds":["view","create","update","delete","approve","reject","export","print","audit"],"club.subscriptions.customer_sources":["view","create","update","delete","export","print","audit"],"club.subscriptions.online":["view","create","update","delete","export","print","audit"],"club.discount_codes.create":["view","create","update","delete","export","print","audit"],"club.discount_codes.captain_allocations":["view","create","update","delete","export","print","audit"],"club.discount_codes.member_grants":["view","create","update","delete","export","print","audit"],"club.discount_codes.member_search":["view","export","print"],"club.discount_codes.member_report":["view","export","print"],"club.discount_codes.captain_codes":["view","export","print"],"club.discount_codes.usage_report":["view","export","print"],"club.lockers":["view","create","update","delete","approve","reject","export","print","audit","configure"],"club.lockers.list":["view","create","update","delete","export","print","audit"],"club.lockers.new":["view","create","update","delete","export","print","audit"],"club.lockers.settings":["view","update","configure","audit"],"club.lockers.inventory":["view","create","update","approve","reject","export","print","audit"],"club.lockers.inventory_reports":["view","export","print"],"club.fitness":["view","create","update","delete","approve","reject","export","print","audit","configure"],"club.fitness.room_bookings":["view","create","update","delete","export","print","audit"],"club.fitness.personal_sessions":["view","create","update","delete","export","print","audit"],"club.fitness.trainers":["view","create","update","delete","export","print","audit"],"club.fitness.trainer_payments":["view","create","update","delete","export","print","audit"],"club.fitness.trainer_search":["view","create","update","delete","export","print","audit"],"club.fitness.trainer_ratings":["view","create","update","delete","export","print","audit"],"club.fitness.trainer_settings":["view","update","configure","audit"],"club.fitness.trainer_targets":["view","update","configure","audit"],"club.fitness.trainer_evaluations":["view","create","update","delete","export","print","audit"],"club.fitness.trainer_evaluation_criteria":["view","update","configure","audit"],"club.fitness.branch_analysis":["view","export","print"],"club.fitness.reception_analysis":["view","export","print"],"club.fitness.shift_analysis":["view","export","print"],"club.fitness.facilities":["view","create","update","delete","export","print","audit"],"club.fitness.equipment":["view","create","update","delete","export","print","audit"],"club.fitness.equipment_maintenance":["view","create","update","delete","export","print","audit"],"club.fitness.spa_services":["view","create","update","delete","export","print","audit"],"club.fitness.spa_bookings":["view","create","update","delete","export","print","audit"],"club.fitness.facility_settings":["view","update","configure","audit"],"club.events":["view","create","update","delete","approve","reject","export","print","audit","configure"],"club.events.list":["view","create","update","delete","approve","reject","export","print","audit"],"club.events.registrations":["view","create","update","delete","approve","reject","export","print","audit"],"club.events.checkin":["view","create","update","delete","export","print","audit"],"club.events.reports":["view","export","print"],"club.events.settings":["view","update","configure","audit"],"financial-reports":["view","create","update","delete","approve","reject","export","print","audit","configure"],"financial-reports.dashboard":["view","export","print"],"financial-reports.expenses":["view","create","update","delete","approve","reject","export","print","audit"],"financial-reports.revenues":["view","create","update","delete","export","print","audit"],"financial-reports.reports":["view","export","print"],"financial-reports.revenue_reports":["view","export","print"],"financial-reports.analysis":["view","export","print"],"financial-reports.profit_loss":["view","export","print"],"financial-reports.daily_closing":["view","create","update","approve","export","print"],"financial-reports.target":["view","update","export","print"],"trainer.portal":["view","create","update","delete","export","print","audit"],"gym-sales":["view","create","update","delete","approve","reject","export","print","audit","configure"],"gym-sales.sales":["view","create","update","delete","approve","reject","export","print","audit","configure"],"gym-sales.sales.new_receipt":["view","create","update","delete","export","print","audit"],"gym-sales.sales.drafts":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.sales.invoices":["view","create","update","delete","export","print","audit"],"gym-sales.sales.revenue":["view","export","print"],"gym-sales.sales.shifts":["view","create","update","delete","approve","reject","export","print","audit","configure"],"gym-sales.sales.treasury":["view","create","update","delete","approve","reject","export","print","audit","configure"],"gym-sales.sales.settlements":["view","create","update","delete","approve","reject","export","print","audit","configure"],"gym-sales.sales.pos_admin":["view","create","update","delete","approve","reject","export","print","audit","configure"],"gym-sales.cafe":["view","create","update","delete","approve","reject","export","print","audit","configure"],"club.cafe.categories":["view","create","update","delete","export","print","audit"],"club.cafe.products":["view","create","update","delete","export","print","audit"],"club.cafe.price_list":["view","update","export","print","audit"],"club.cafe.reports":["view","export","print"],"club.cafe.feedback_reports":["view","export","print"],"gym-sales.inventory":["view","create","update","delete","approve","reject","export","print","audit","configure"],"gym-sales.inventory.dashboard":["view","export","print"],"gym-sales.inventory.raw_materials":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.inventory.gym_issue":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.inventory.stock_taking":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.inventory.movement_log":["view","export","print"],"gym-sales.procurement":["view","create","update","delete","approve","reject","export","print","audit","configure"],"gym-sales.procurement.requisitions":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.procurement.purchase_orders":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.procurement.goods_receipts":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.procurement.invoices":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.procurement.returns":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.procurement.dashboard":["view","export","print"],"gym-sales.procurement.settings":["view","update","configure","audit"],"gym-sales.procurement.suppliers":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.procurement.cafe_purchases":["view","create","update","delete","approve","reject","export","print","audit"],"gym-sales.procurement.supplier_payments":["view","create","update","delete","approve","reject","export","print","audit"],"accounting":["view","create","update","delete","approve","reject","export","print","audit","configure"],"accounting.hub":["view","export","print"],"accounting.payment_methods":["view","create","update","delete","export","print","audit"],"accounting.dashboard":["view","export","print"],"accounting.ledger":["view","create","update","delete","approve","reject","export","print","audit","configure"],"accounting.journal":["view","create","update","delete","approve","reject","export","print","audit"],"accounting.accounts":["view","create","update","delete","export","print","audit"],"accounting.reports.gl":["view","export","print"],"accounting.reports.statement":["view","export","print"],"accounting.statements":["view","create","update","delete","approve","reject","export","print","audit","configure"],"accounting.reports":["view","export","print"],"accounting.reports.income":["view","export","print"],"accounting.reports.balance":["view","export","print"],"accounting.reports.cashflow":["view","export","print"],"accounting.settings":["view","update","configure","audit"],"portal-management":["view","create","update","delete","approve","reject","export","print","audit","configure"],"portal-management.hub":["view","export","print"],"portal-management.basics":["view","create","update","delete","approve","reject","export","print","audit","configure"],"portal-management.company":["view","update","audit"],"portal-management.sliders":["view","create","update","delete","export","print","audit"],"portal-management.partners":["view","create","update","delete","export","print","audit"],"portal-management.policies":["view","create","update","delete","export","print","audit"],"portal-management.about-group":["view","create","update","delete","approve","reject","export","print","audit","configure"],"portal-management.about":["view","update","audit"],"portal-management.media":["view","create","update","delete","approve","reject","export","print","audit","configure"],"portal-management.photos":["view","create","update","delete","export","print","audit"],"portal-management.videos":["view","create","update","delete","export","print","audit"],"portal-management.hero-videos":["view","create","update","delete","export","print","audit"],"portal-management.branches":["view","create","update","delete","approve","reject","export","print","audit","configure"],"portal-management.branch-settings":["view","create","update","delete","export","print","audit"],"portal-management.trainers":["view","create","update","delete","export","print","audit"],"portal-management.classes":["view","create","update","delete","export","print","audit"],"portal-management.requests":["view","create","update","delete","approve","reject","export","print","audit","configure"],"portal-management.messages":["view","create","update","delete","export","print","audit"],"portal-management.messages-read":["view","create","update","delete","export","print","audit"],"portal-management.jobs":["view","create","update","delete","approve","reject","export","print","audit","configure"],"portal-management.jobs-list":["view","create","update","delete","export","print","audit"],"portal-management.job-applications":["view","create","update","delete","export","print","audit"],"portal-management.job-applications-accepted":["view","create","update","delete","export","print","audit"],"portal-management.job-applications-rejected":["view","create","update","delete","export","print","audit"],"portal-management.store":["view","create","update","delete","approve","reject","export","print","audit","configure"],"portal-management.badges":["view","create","update","delete","export","print","audit"],"portal-management.captain-discounts":["view","create","update","delete","export","print","audit"],"portal-management.categories":["view","create","update","delete","export","print","audit"],"portal-management.products":["view","create","update","delete","export","print","audit"],"portal-management.orders":["view","create","update","delete","export","print","audit"],"portal-management.customers":["view","create","update","delete","export","print","audit"],"portal-management.sales-report":["view","export","print"],"portal-management.offers":["view","create","update","delete","export","print","audit"],"portal-management.section-settings":["view","create","update","delete","export","print","audit"],"portal-management.stats":["view","export","print"],"portal-management.ticker":["view","create","update","delete","export","print","audit"],"portal-management.services":["view","create","update","delete","export","print","audit"],"portal-management.class-showcase":["view","create","update","delete","export","print","audit"],"portal-management.about-features":["view","create","update","delete","export","print","audit"],"portal-management.coach-features":["view","create","update","delete","export","print","audit"],"portal-management.membership-plans":["view","create","update","delete","export","print","audit"],"app-management":["view","create","update","delete","approve","reject","export","print","audit","configure"],"app-management.hub":["view","export","print"],"app-management.about":["view","update","audit"],"app-management.invitations":["view","create","update","delete","approve","reject","export","print","audit","configure"],"app-management.invitations.sent":["view","create","update","delete","export","print","audit"],"app-management.invitations.accepted":["view","create","update","delete","export","print","audit"],"app-management.invitations.attended":["view","create","update","delete","export","print","audit"],"app-management.invitations.rejected":["view","create","update","delete","export","print","audit"],"app-management.content":["view","create","update","delete","approve","reject","export","print","audit","configure"],"app-management.offers":["view","create","update","delete","export","print","audit"],"app-management.trainers":["view","create","update","delete","export","print","audit"],"app-management.exercise-categories":["view","create","update","delete","export","print","audit"],"app-management.exercises":["view","create","update","delete","export","print","audit"],"app-management.news":["view","create","update","delete","export","print","audit"],"app-management.community":["view","create","update","delete","export","print","audit"],"app-management.ads":["view","create","update","delete","export","print","audit"],"app-management.notifications":["view","create","update","delete","export","print","audit"],"admin":["view","create","update","delete","approve","reject","export","print","audit","configure"],"admin.dashboard":["view","export","print"],"admin.hub":["view","export","print"],"org.branches":["view","create","update","delete","export","print","audit"],"org.departments":["view","create","update","delete","export","print","audit"],"admin.roles":["view","manage","audit"],"admin.exceptions":["view","manage","audit"],"admin.users":["view","create","update","delete","audit"],"admin.audit":["view","export"],"admin.business-audit":["view","export"],"admin.automation":["view","update","configure","audit"],"admin.gym-policies":["view","update","configure","audit"],"admin.backup":["view","export"],"admin.webhooks":["view","manage"],"admin.company":["view","update","audit"],"admin.forms":["view","update","configure","audit"],"admin.locations":["view","update","configure","audit"],"admin.insurance":["view","update","configure","audit"],"org.branch_groups":["view","create","update","delete","export","print","audit"],"customer-service":["view","create","update","delete","approve","reject","export","print","audit","configure"],"affairs.customer_service":["view","create","update","delete","approve","reject","export","print","audit","configure"],"customer-service.questions":["view","create","update","delete","export","print","audit"],"customer-service.feedback":["view","create","update","delete","export","print","audit"],"customer-service.reports":["view","export","print"],"customer-service.hub":["view","export","print"]};
const INVITATIONS: Record<string,string> = {pending:'app-management.invitations.sent',accepted:'app-management.invitations.accepted',attended:'app-management.invitations.attended',rejected:'app-management.invitations.rejected'};
const own = (map: Record<string,unknown>, key: string) => Object.prototype.hasOwnProperty.call(map,key);
/** Explicit endpoint policies. Undefined preserves the existing route policy; [] denies invalid parameters. */
export function sidebarApiPermissions(controller: string, method: string, request: Pick<Request,'params'|'query'|'body'>): string[] | undefined {
 const id=controller+'.'+method;
 if(own(SIDEBAR_API_POLICIES,id))return SIDEBAR_API_POLICIES[id];
 if((controller==='AppManagementController'&&['listInvitations','listByStatus','createInvitation','updateInvitation','updateInvitationStatus'].includes(method))||(controller==='MemberCompatController'&&['adminListInvitations','adminUpdateInvitationStatus'].includes(method))){
  const read=['listInvitations','listByStatus','adminListInvitations'].includes(method);
  if(read){const status=request.params?.status??request.query?.status;return typeof status==='string'&&own(INVITATIONS,status)?[INVITATIONS[status]+':view']:['app-management.invitations:view'];}
  return Object.values(INVITATIONS).map(key=>key+(method==='createInvitation'?':create':':update'));
 }
 if(controller!=='PortalManagementController')return undefined;
 if(method==='summary')return ['portal-management.hub:view'];
 if(method==='options')return Object.values(PORTAL_PAGES).map(key=>key+':view');
 if(method==='report')return ['portal-management.sales-report:view'];
 if(method==='stock')return ['portal-management.products:update'];
 const params=request.params||{};
 if(method==='setting'||method==='saveSetting'){
  const value=params.key;if(typeof value!=='string'||!own(SETTING_PAGES,value))return [];
  return [SETTING_PAGES[value]+(method==='setting'?':view':':update')];
 }
 const value=params.type;if(typeof value!=='string'||!own(PORTAL_PAGES,value))return [];
 let keys=[PORTAL_PAGES[value]];
 if(value==='messages'){
  const status=request.query?.status;
  if(method==='list'&&status!=='read'&&status!=='unread')return ['portal-management:view'];
  keys=method==='list'?[status==='read'?PORTAL_PAGES['messages-read']:PORTAL_PAGES.messages]:[PORTAL_PAGES.messages,PORTAL_PAGES['messages-read']];
 }else if(value==='job-applications'){
  const status=request.query?.status;
  if(method==='list'&&!['pending','accepted','rejected'].includes(String(status)))return ['portal-management:view'];
  keys=method==='list'?[PORTAL_PAGES[status==='accepted'?'job-applications-accepted':status==='rejected'?'job-applications-rejected':'job-applications']]:[PORTAL_PAGES['job-applications'],PORTAL_PAGES['job-applications-accepted'],PORTAL_PAGES['job-applications-rejected']];
 }
 const action=method==='list'?'view':method==='create'?'create':method==='remove'?'delete':'update';
 // A page without a catalog action keeps that operation restricted to the pre-existing department action.
 const cells=keys.filter(key=>ACTIONS[key]?.includes(action)).map(key=>key+':'+action);
 return cells.length?cells:['portal-management:'+action];
}
