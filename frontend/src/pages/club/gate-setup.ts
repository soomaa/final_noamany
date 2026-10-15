export const GATE_MODELS = ['C3-200', 'INBIO160-PRO', 'INBIO260-PRO'] as const;
export interface GateForm {
  name: string; branchId: string; model: string; staticIp: string; port: string;
  entryDoorNo: string; exitDoorNo: string;
  connectionMode?: 'agent' | 'push';
  serialNumber?: string;
  pushAllowedIp?: string;
}
export function validateGateForm(form: GateForm): string | null {
  if (!form.name.trim() || form.name.trim().length > 120 || !/^[1-9]\d*$/.test(form.branchId)) return 'أدخلي اسم البوابة واختاري الفرع';
  if ((form.connectionMode ?? 'agent') === 'push') {
    if (!/^[A-Za-z0-9]{4,80}$/.test((form.serialNumber ?? '').trim())) return 'أدخلي الرقم التسلسلي للاتصال المباشر';
    const locked = (form.pushAllowedIp ?? '').trim();
    if (locked) {
      const ip = locked.split('.');
      if (ip.length !== 4 || ip.some((v) => !/^(0|[1-9]\d{0,2})$/.test(v) || Number(v) > 255)) return 'IP المسموح غير صحيح';
    }
    return null;
  }
  if (!GATE_MODELS.includes(form.model as typeof GATE_MODELS[number])) return 'اختاري موديل الكنترول';
  const ip = form.staticIp.trim().split('.');
  if (ip.length !== 4 || ip.some((v) => !/^(0|[1-9]\d{0,2})$/.test(v) || Number(v) > 255)) return 'أدخلي عنوان IPv4 صحيح للكنترول';
  if (!/^\d+$/.test(form.port) || Number(form.port) < 1 || Number(form.port) > 65535) return 'رقم المنفذ يجب أن يكون بين 1 و65535';
  const max = form.model === 'INBIO160-PRO' ? 1 : 2;
  if (!/^[12]$/.test(form.entryDoorNo) || Number(form.entryDoorNo) > max || !/^[012]$/.test(form.exitDoorNo) || Number(form.exitDoorNo) > max) return 'أرقام المخارج لا تطابق موديل الكنترول';
  return null;
}
export function buildGateSetup(controller: { id: number; model: string; staticIp: string; port: number }, agentToken: string, origin: string) {
  const url = new URL('/api', origin);
  return {
    apiBaseUrl: url.href, controllerId: controller.id, agentToken,
    controllerIp: controller.staticIp, controllerPort: controller.port,
    controllerModel: controller.model, communicationPassword: '',
    sdkPath: '%ProgramFiles%\\ONE80 Gate Agent\\sdk',
    runtimePath: '%ProgramData%\\ONE80\\GateAgent', syncIntervalSeconds: 60, pollIntervalMs: 250,
  };
}
