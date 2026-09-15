/**
 * Faithful port of the 5-stage role-routed approval chain shared by agazat + ozonat
 * (legacy: Vacation.php / Ezn_order.php `process_ta7welat_procedures`).
 *
 * Stages, driven by `actions_sends` + per-stage enum('yes','no') flags:
 *   send_to_direct_manager -> approve_direct_manager (suspend 1)
 *                          -> approve_moder_edara    (suspend 4)
 *                          -> approve_hr             (suspend 4)
 *                          -> approve_moder_3am      (suspend 4, sets close_talab)
 *
 * Reject at any stage sets the stage flag 'no' and suspend 2 (direct manager) or 5 (later).
 * Routing of the *next* recipient is by job-title code via get_emps_by_mosama (mosama_code).
 */

export type ChainStage =
  | 'approve_direct_manager'
  | 'approve_moder_edara'
  | 'approve_hr'
  | 'approve_moder_3am';

/** The action a `wared` recipient can take, given the current actions_sends value. */
export const NEXT_STAGE_BY_CURRENT: Record<string, ChainStage> = {
  send_to_direct_manager: 'approve_direct_manager',
  approve_direct_manager: 'approve_moder_edara',
  approve_moder_edara: 'approve_hr',
  approve_hr: 'approve_moder_3am',
};

/** suspend value written on accept for each stage (legacy update_filed_action). */
export const ACCEPT_SUSPEND: Record<ChainStage, number> = {
  approve_direct_manager: 1,
  approve_moder_edara: 4,
  approve_hr: 4,
  approve_moder_3am: 4,
};

/** suspend value written on reject for each stage. */
export const REJECT_SUSPEND: Record<ChainStage, number> = {
  approve_direct_manager: 2,
  approve_moder_edara: 5,
  approve_hr: 5,
  approve_moder_3am: 5,
};

/** legacy talab_in_fk process codes used in history rows. */
export const PROCESS_CODE = {
  ACCEPT: 813,
  ACCEPT_LATER: 815,
  REJECT_DIRECT: 814,
  REJECT_LATER: 816,
  CLOSE: 819,
} as const;

/** The dated-flag column to stamp for each stage. */
export const STAGE_DATE_FIELD: Record<ChainStage, string> = {
  approve_direct_manager: 'approve_direct_manager_date',
  approve_moder_edara: 'approve_moder_edara_date',
  approve_hr: 'approve_hr_date',
  approve_moder_3am: 'approve_moder_3am_date',
};

/**
 * Mosama (job-title) codes the *next* recipient is looked up by, mirroring the legacy
 * branches in process_ta7welat_procedures. The direct-manager stage routes on
 * emp_type / edara_id; subsequent stages route on fixed codes.
 */
export function nextRecipientMosama(
  stage: ChainStage,
  ctx: { empType?: number | null; edaraId?: number | null },
): number | null {
  switch (stage) {
    case 'approve_direct_manager': {
      // after direct-manager accept -> route to moder_edara recipient
      // legacy: emp_type 1 -> 32 else 36 ; edara_id 30 -> 32 ; edara_id 10 -> 42
      let code = ctx.empType === 1 ? 32 : 36;
      if (ctx.edaraId === 30) code = 32;
      else if (ctx.edaraId === 10) code = 42;
      return code;
    }
    case 'approve_moder_edara':
      return 44; // after edara accept -> hr
    case 'approve_hr':
      return 25; // after hr accept -> general manager
    case 'approve_moder_3am':
      return null; // final: routes back to publisher
    default:
      return null;
  }
}
