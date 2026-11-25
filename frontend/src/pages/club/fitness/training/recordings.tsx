import { useEffect, useRef, useState } from 'react';
import { Copy, Mic, MessageCircle, Square, Trash2, Upload, Video } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatDate } from '@/lib/formatters';
import { formatDisplayNumber } from '@/lib/number-display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TrainingRecording } from './model';

const RETENTION = [7, 14, 30] as const;
const AUDIO_MAX_SECONDS = 600;
const VIDEO_MAX_SECONDS = 60;
const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;

/** MP4/AAC first: it plays on iPhone and Android; WebM is the fallback for older Chrome. */
export function preferredAudioType(supported: (type: string) => boolean): string | undefined {
  return ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(supported);
}

export const absoluteRecordingUrl = (url: string) => new URL(url, window.location.origin).href;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function mediaDuration(file: Blob, kind: 'audio' | 'video') {
  return new Promise<number | null>((done) => {
    const el = document.createElement(kind);
    const src = URL.createObjectURL(file);
    const finish = (value: number | null) => { URL.revokeObjectURL(src); done(value); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? Math.round(el.duration) : null);
    el.onerror = () => finish(null);
    el.src = src;
  });
}

export function DayRecordings({
  memberId,
  dayId,
  recordings,
  canManage,
  canDelete = canManage,
  base,
  ar,
  onChanged,
}: {
  memberId: number;
  dayId: string;
  recordings: TrainingRecording[];
  canManage: boolean;
  canDelete?: boolean;
  base: string;
  ar: boolean;
  onChanged: () => unknown;
}) {
  const tr = (a: string, e: string) => (ar ? a : e);
  const [draft, setDraft] = useState<{ blob: Blob; kind: 'audio' | 'video'; seconds: number | null; preview: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [retention, setRetention] = useState<number>(14);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.preview); }, [draft]);

  async function start() {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error(tr('المتصفح لا يدعم التسجيل. ارفع ملفًا صوتيًا بدلًا من ذلك.', 'This browser cannot record. Upload an audio file instead.'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = preferredAudioType((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : undefined);
      const chunks: Blob[] = [];
      const began = Date.now();
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        clearInterval(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' });
        if (blob.size) setDraft({ blob, kind: 'audio', seconds: Math.round((Date.now() - began) / 1000), preview: URL.createObjectURL(blob) });
      };
      recorder.current = rec;
      rec.start(1000);
      setElapsed(0);
      setRecording(true);
      timer.current = setInterval(() => {
        const seconds = Math.round((Date.now() - began) / 1000);
        setElapsed(seconds);
        if (seconds >= AUDIO_MAX_SECONDS) rec.stop();
      }, 500);
    } catch {
      toast.error(tr('اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.', 'Allow microphone access and try again.'));
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : 'audio';
    if (file.size > (kind === 'video' ? VIDEO_MAX_BYTES : AUDIO_MAX_BYTES)) {
      toast.error(kind === 'video' ? tr('الفيديو بحد أقصى 20 ميجا.', 'Video is limited to 20 MB.') : tr('الصوت بحد أقصى 10 ميجا.', 'Audio is limited to 10 MB.'));
      return;
    }
    const seconds = await mediaDuration(file, kind);
    if (seconds != null && seconds > (kind === 'video' ? VIDEO_MAX_SECONDS : AUDIO_MAX_SECONDS)) {
      toast.error(kind === 'video' ? tr('الفيديو بحد أقصى 60 ثانية.', 'Video is limited to 60 seconds.') : tr('الصوت بحد أقصى 10 دقائق.', 'Audio is limited to 10 minutes.'));
      return;
    }
    setDraft({ blob: file, kind, seconds, preview: URL.createObjectURL(file) });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const form = new FormData();
      const ext = draft.blob.type.includes('mp4') ? (draft.kind === 'audio' ? 'm4a' : 'mp4') : draft.blob.type.includes('ogg') ? 'ogg' : draft.blob.type.includes('quicktime') ? 'mov' : draft.blob.type.includes('mpeg') ? 'mp3' : 'webm';
      form.append('file', draft.blob, draft.blob instanceof File ? draft.blob.name : `recording.${ext}`);
      form.append('kind', draft.kind);
      form.append('dayId', dayId);
      form.append('retentionDays', String(retention));
      form.append('note', note.trim());
      if (draft.seconds != null) form.append('durationSeconds', String(draft.seconds));
      await api.post(`${base}/members/${memberId}/recordings`, form);
      toast.success(tr('تم حفظ التسجيل', 'Recording saved'));
      setDraft(null);
      setNote('');
      await onChanged();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: TrainingRecording) {
    const ok = await confirm({ title: tr('حذف التسجيل؟', 'Delete recording?'), description: tr('لن يعمل الرابط ولا الكود بعد الحذف.', 'The link and QR code will stop working.'), confirmLabel: tr('حذف', 'Delete'), variant: 'destructive' });
    if (!ok) return;
    try {
      await api.delete(`${base}/members/${memberId}/recordings/${item.id}`);
      await onChanged();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(absoluteRecordingUrl(url));
      toast.success(tr('تم نسخ الرابط', 'Link copied'));
    } catch {
      toast.error(tr('تعذر النسخ', 'Could not copy'));
    }
  }

  return (
    <section className="mt-5 space-y-3 rounded-lg bg-muted/40 p-4" aria-label={tr('تسجيلات الكابتن لهذا اليوم', 'Coach recordings for this day')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{tr('رسالة صوتية / فيديو للعميل', 'Voice / video note for the member')}</h4>
        <p className="text-xs text-muted-foreground">{tr('تظهر في تطبيق العضو وككود QR في ورقة الحصة، وتُحذف تلقائيًا بعد المدة المختارة.', 'Shown in the member app and as a QR code on the sheet; deleted automatically after the chosen period.')}</p>
      </div>
      {recordings.map((item) => (
        <div key={item.id} className="space-y-2 rounded-lg border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              {item.kind === 'video' ? <Video className="size-4" /> : <Mic className="size-4" />}
              {item.kind === 'video' ? tr('فيديو', 'Video') : tr('تسجيل صوتي', 'Voice note')}
              {item.durationSeconds != null && <span className="tabular-nums text-muted-foreground">· {clock(item.durationSeconds)}</span>}
            </span>
            <span className={item.expired ? 'text-muted-foreground' : 'text-xs text-muted-foreground'}>
              {item.expired ? tr('انتهت صلاحية التسجيل', 'Recording expired') : `${tr('متاح حتى', 'Available until')} ${formatDate(item.expiresAt)}`}
            </span>
          </div>
          {item.note && <p className="text-sm">{item.note}</p>}
          {item.url && (item.kind === 'video'
            ? <video controls preload="none" playsInline className="max-h-72 w-full rounded-md bg-black" src={item.url} />
            : <audio controls preload="none" className="w-full" src={item.url} />)}
          <div className="flex flex-wrap gap-2">
            {item.url && <Button size="sm" variant="outline" onClick={() => void copy(item.url!)}><Copy className="size-3.5" />{tr('نسخ الرابط', 'Copy link')}</Button>}
            {item.url && <Button size="sm" variant="outline" asChild><a href={`https://wa.me/?text=${encodeURIComponent(absoluteRecordingUrl(item.url))}`} target="_blank" rel="noreferrer"><MessageCircle className="size-3.5" />{tr('إرسال واتساب', 'Send on WhatsApp')}</a></Button>}
            {canDelete && <Button size="sm" variant="ghost" onClick={() => void remove(item)}><Trash2 className="size-3.5" />{tr('حذف', 'Delete')}</Button>}
          </div>
        </div>
      ))}
      {!recordings.length && !canManage && <p className="text-sm text-muted-foreground">{tr('لا توجد تسجيلات لهذا اليوم.', 'No recordings for this day.')}</p>}
      {canManage && !draft && (
        <div className="flex flex-wrap items-center gap-2">
          {recording ? (
            <Button variant="destructive" onClick={() => recorder.current?.stop()}>
              <Square className="size-4" />{tr('إيقاف', 'Stop')} <span className="tabular-nums">{clock(elapsed)}</span>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void start()}><Mic className="size-4" />{tr('سجّل رسالة صوتية', 'Record a voice note')}</Button>
          )}
          <Button variant="outline" disabled={recording} onClick={() => fileInput.current?.click()}><Upload className="size-4" />{tr('رفع ملف صوت أو فيديو', 'Upload audio or video')}</Button>
          <input ref={fileInput} type="file" hidden accept="audio/*,video/mp4,video/quicktime,video/webm" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="text-xs text-muted-foreground">{tr(`صوت حتى ${formatDisplayNumber(10)} دقائق · فيديو حتى ${formatDisplayNumber(60)} ثانية`, 'Audio up to 10 min · video up to 60 s')}</span>
        </div>
      )}
      {canManage && draft && (
        <div className="space-y-3 rounded-lg border bg-background p-3">
          {draft.kind === 'video'
            ? <video controls playsInline className="max-h-72 w-full rounded-md bg-black" src={draft.preview} />
            : <audio controls className="w-full" src={draft.preview} />}
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <label className="text-sm">{tr('مدة الاحتفاظ', 'Keep for')}
              <select className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" value={retention} onChange={(e) => setRetention(Number(e.target.value))}>
                {RETENTION.map((d) => <option key={d} value={d}>{tr(`${formatDisplayNumber(d)} يوم`, `${d} days`)}</option>)}
              </select>
            </label>
            <label className="text-sm">{tr('ملاحظة · اختياري', 'Note · optional')}<Input className="mt-2" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" disabled={busy} onClick={() => void save()}>{busy ? tr('جارٍ الرفع…', 'Uploading…') : tr('حفظ وإرسال للعميل', 'Save & share with member')}</Button>
            <Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>{tr('إلغاء', 'Discard')}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
