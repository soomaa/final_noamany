/**
 * 5-stage role-routed approval chain for agazat (leave requests).
 * Faithful port of Vacation.php `process_ta7welat_procedures` + `get_emps_by_mosama`.
 * Identical machine to the ozonat chain; kept in-module to respect module boundaries.
 *
 *   send_to_emp_badel (if substitute) -> send_to_direct_manager
 *     -> approve_direct_manager (suspend 1)
 *     -> approve_moder_edara    (suspend 4)
 *     -> approve_hr             (suspend 4)
 *     -> approve_moder_3am      (suspend 4, sets close_talab)
 */

export type LeaveStage =
  | 'approve_direct_manager'
  | 'approve_moder_edara'
  | 'approve_hr'
  | 'approve_moder_3am';

export const NEXT_STAGE_BY_CURRENT: Record<string, LeaveStage> = {
  send_to_direct_manager: 'approve_direct_manager',
  approve_direct_manager: 'approve_moder_edara',
  approve_moder_edara: 'approve_hr',
  approve_hr: 'approve_moder_3am',
};

export const ACCEPT_SUSPEND: Record<LeaveStage, number> = {
  approve_direct_manager: 1,
  approve_moder_edara: 4,
  approve_hr: 4,
  approve_moder_3am: 4,
};

export const REJECT_SUSPEND: Record<LeaveStage, number> = {
  approve_direct_manager: 2,
  approve_moder_edara: 5,
  approve_hr: 5,
  approve_moder_3am: 5,
};

export const STAGE_DATE_FIELD: Record<LeaveStage, string> = {
  approve_direct_manager: 'approve_direct_manager_date',
  approve_moder_edara: 'approve_moder_edara_date',
  approve_hr: 'approve_hr_date',
  approve_moder_3am: 'approve_moder_3am_date',
};

export const PROCESS_CODE = {
  ACCEPT: 813,
  ACCEPT_LATER: 815,
  REJECT_DIRECT: 814,
  REJECT_LATER: 816,
  CLOSE: 819,
} as const;

export function nextRecipientMosama(
  stage: LeaveStage,
  ctx: { empType?: number | null; edaraId?: number | null },
): number | null {
  switch (stage) {
    case 'approve_direct_manager': {
      let code = ctx.empType === 1 ? 32 : 36;
      if (ctx.edaraId === 30) code = 32;
      else if (ctx.edaraId === 10) code = 42;
      return code;
    }
    case 'approve_moder_edara':
      return 44;
    case 'approve_hr':
      return 25;
    case 'approve_moder_3am':
      return null;
    default:
      return null;
  }
}
