import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Time12Input } from '@/components/common/time-12-input';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from 'sonner';
import { useClubEventsLiveApi } from './use-club-events-live-api';
import { useEventLiveBasePath } from './event-live-context';
import { EventLiveBackLink } from './EventLiveBackLink';
import { EventLiveNavMenu } from './EventLiveNavMenu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Image as ImageIcon,
  Video, FileText, Images, GripVertical, Eye, EyeOff, X,
} from "lucide-react";
import {
  useProgramSegments, ProgramSegment, SegmentKind, SEGMENT_KIND_LABEL, getYouTubeId,
} from "./useProgramSegments";
import { EventLiveBackdrop } from "./EventLiveBackdrop";
import { ProgramSlide } from "./ProgramSlide";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLocale } from '@/store/locale';

type Draft = Omit<ProgramSegment, "id"> & { id?: string };

const EMPTY: Draft = {
  title: "",
  description: "",
  kind: "text",
  media_urls: [],
  video_url: "",
  duration_seconds: 12,
  order_index: 0,
  enabled: true,
  scheduled_time: "",
  duration_minutes: null,
  show_duration: true,
};

const KIND_ICON: Record<SegmentKind, JSX.Element> = {
  text: <FileText className="h-4 w-4" />,
  image: <ImageIcon className="h-4 w-4" />,
  gallery: <Images className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
};

const EventLiveProgram = () => {
  const { ui } = useLocale();
  const liveApi = useClubEventsLiveApi();
  const basePath = useEventLiveBasePath();
  const { segments, reload } = useProgramSegments(false);
    const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const openNew = () => {
    setDraft({ ...EMPTY, order_index: segments.length });
    setOpen(true);
  };
  const openEdit = (s: ProgramSegment) => {
    setDraft({ ...s, description: s.description ?? "", video_url: s.video_url ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!draft.title.trim()) {
      toast.error(ui('العنوان مطلوب'));
      return;
    }
    setSaving(true);
    const payload = {
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      kind: draft.kind,
      mediaUrls: draft.media_urls.filter(Boolean),
      videoUrl: draft.video_url?.trim() || null,
      durationSeconds: Math.max(3, Number(draft.duration_seconds) || 12),
      orderIndex: draft.order_index,
      enabled: draft.enabled,
      scheduledTime: (draft.scheduled_time || "").trim() || null,
      durationMinutes: draft.duration_minutes != null && Number(draft.duration_minutes) > 0
        ? Math.max(1, Math.round(Number(draft.duration_minutes)))
        : null,
      showDuration: !!draft.show_duration,
    };
    try {
      if (draft.id) await liveApi.update(draft.id, payload);
      else await liveApi.create(payload);
      toast.success(draft.id ? ui('تم التحديث') : ui('تمت الإضافة'));
      setOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || ui("تعذر الحفظ"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(ui("حذف هذه الفقرة؟"))) return;
    try {
      await // delete-disabled: liveApi.remove(id);
      toast.success(ui("تم الحذف"));
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || ui("تعذر الحذف"));
    }
  };

  const move = async (id: string, dir: -1 | 1) => {
    const idx = segments.findIndex((s: ProgramSegment) => s.id === id);
    const swap = segments[idx + dir];
    if (!swap) return;
    const a = segments[idx];
    try {
      await Promise.all([
        liveApi.update(a.id, { orderIndex: swap.order_index }),
        liveApi.update(swap.id, { orderIndex: a.order_index }),
      ]);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || ui("تعذر حفظ الترتيب"));
    }
  };

  // السحب-والإفلات: يعيد ترقيم كل الفقرات ويحفظها فعلياً في قاعدة البيانات
  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = segments.findIndex((s: ProgramSegment) => s.id === active.id);
    const newIdx = segments.findIndex((s: ProgramSegment) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(segments, oldIdx, newIdx) as ProgramSegment[];
    try {
      await Promise.all(reordered.map((s: ProgramSegment, i: number) => liveApi.update(s.id, { orderIndex: i })));
      toast.success(ui("تم حفظ الترتيب"));
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || ui("تعذر حفظ الترتيب"));
    }
  };

  const toggleEnabled = async (s: ProgramSegment) => {
    try {
      await liveApi.update(s.id, { enabled: !s.enabled });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || ui("تعذر التحديث"));
    }
  };

  return (
    <div dir="rtl" className="min-h-screen relative bg-[#FAFBF5]">
      <EventLiveBackdrop screen="display" />
      <header className="border-b border-[hsl(var(--grad-green))]/20 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 sm:px-8 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[hsl(var(--grad-green-ink))]">{ui("فقرات الحفل")}</h1>
            <p className="text-xs text-[hsl(var(--grad-green-dark))] font-medium">{ui("تظهر بالتناوب على شاشة العرض")}</p>
          </div>
          <div className="flex items-center gap-2">
            <EventLiveNavMenu variant="light" current="program" />
            <EventLiveBackLink />
            <Button asChild variant="outline" size="sm" className="border-[hsl(var(--grad-green))] text-[hsl(var(--grad-green-dark))]">
              <Link to={`${basePath}/display`}>
                <ArrowRight className="h-4 w-4 ml-1" />
                {ui("شاشة العرض")}
              </Link>
            </Button>
            <Button onClick={openNew} size="sm" className="bg-[hsl(var(--grad-green))] hover:bg-[hsl(var(--grad-green-dark))]">
              <Plus className="h-4 w-4 ml-1" /> {ui("فقرة جديدة")}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-8 py-6 space-y-3">
        {segments.length === 0 && (
          <Card className="p-10 text-center border-[hsl(var(--grad-green))]/30 bg-white/80">
            <Images className="h-10 w-10 text-[hsl(var(--grad-green))]/50 mx-auto mb-3" />
            <p className="text-[hsl(var(--grad-green-dark))] font-bold">{ui("لا توجد فقرات بعد")}</p>
            <p className="text-xs text-muted-foreground mt-1">{ui("أضف فقرة لتظهر بالتناوب على شاشة العرض")}</p>
          </Card>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={segments.map((s: ProgramSegment) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="grid gap-3">
              {segments.map((s: ProgramSegment, i: number) => (
                <SegmentRow
                  key={s.id}
                  s={s}
                  i={i}
                  total={segments.length}
                  onUp={() => move(s.id, -1)}
                  onDown={() => move(s.id, 1)}
                  onToggle={() => toggleEnabled(s)}
                  onEdit={() => openEdit(s)}
                  onRemove={() => remove(s.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[hsl(var(--grad-green-ink))]">{draft.id ? ui("تعديل فقرة") : ui("فقرة جديدة")}</DialogTitle>
          </DialogHeader>
          <div className="grid lg:grid-cols-2 gap-5 py-2">
            <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{ui("العنوان *")}</Label>
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={ui("مثال: كلمة المدير")} />
              </div>
              <div className="space-y-1.5">
                <Label>{ui("نوع الفقرة")}</Label>
                <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as SegmentKind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SEGMENT_KIND_LABEL) as SegmentKind[]).map((k) => (
                      <SelectItem key={k} value={k}>{SEGMENT_KIND_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{ui("مدة الفقرة (دقيقة)")}</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder={ui("مثال: 5")}
                  value={draft.duration_minutes ?? ""}
                  onChange={(e) => setDraft({ ...draft, duration_minutes: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{ui("عرض المدة على الشاشة")}</Label>
                <div className="flex items-center gap-2 h-10 px-3 border rounded-md">
                  <Switch checked={!!draft.show_duration} onCheckedChange={(v) => setDraft({ ...draft, show_duration: v })} />
                  <span className="text-sm font-bold text-[hsl(var(--grad-green-ink))]">{draft.show_duration ? ui("تظهر") : ui("مخفية")}</span>
                </div>
              </div>
            </div>

            {(draft.kind === "image" || draft.kind === "gallery") && (
              <MediaUrlsEditor
                urls={draft.media_urls}
                single={draft.kind === "image"}
                onChange={(media_urls) => setDraft({ ...draft, media_urls })}
              />
            )}

            {draft.kind === "video" && (
              <div className="space-y-1.5">
                <Label>{ui("رابط الفيديو (YouTube أو MP4)")}</Label>
                <Input
                  value={draft.video_url ?? ""}
                  onChange={(e) => setDraft({ ...draft, video_url: e.target.value })}
                  placeholder={ui("https://youtu.be/... أو https://.../video.mp4")}
                  dir="ltr"
                />
                {draft.video_url && getYouTubeId(draft.video_url) && (
                  <p className="text-[10px] text-[hsl(var(--grad-green-dark))] font-bold">{ui("✓ تم التعرف على فيديو YouTube")}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{ui("مدة العرض (ثانية)")}</Label>
                <Input type="number" min={3} value={draft.duration_seconds}
                  onChange={(e) => setDraft({ ...draft, duration_seconds: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{ui("الحالة")}</Label>
                <div className="flex items-center gap-2 h-10 px-3 border rounded-md">
                  <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
                  <span className="text-sm font-bold text-[hsl(var(--grad-green-ink))]">{draft.enabled ? ui("مفعّلة") : ui("مخفية")}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{ui("وقت الفقرة (اختياري)")}</Label>
              <Time12Input value={draft.scheduled_time ?? ''} onValueChange={(value) => setDraft({ ...draft, scheduled_time: value })} />
              <p className="text-[10px] text-muted-foreground">
                {ui('عند تعبئته، تُعرض شريحة "جدول الفقرات" بالتناوب وترتّب الفقرات حسب الوقت مع إبراز الحالية والقادمة.')}
              </p>
            </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[hsl(var(--grad-green-dark))] font-bold">{ui("معاينة فورية")}</Label>
              <div className="rounded-2xl border-2 border-dashed border-[hsl(var(--grad-green))]/40 bg-gradient-to-br from-[#FAFBF5] to-white p-4 min-h-[320px] flex items-center justify-center overflow-hidden">
                {draft.title.trim() ? (
                  <div className="w-full scale-90 origin-center">
                    <ProgramSlide
                      segment={{
                        id: "preview",
                        title: draft.title,
                        description: draft.description || null,
                        kind: draft.kind,
                        media_urls: draft.media_urls.filter(Boolean),
                        video_url: draft.video_url || null,
                        duration_seconds: Math.max(3, Number(draft.duration_seconds) || 12),
                        order_index: draft.order_index,
                        enabled: draft.enabled,
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{ui("اكتب العنوان لتظهر المعاينة هنا")}</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{ui("إلغاء")}</Button>
            <Button onClick={save} disabled={saving} className="bg-[hsl(var(--grad-green))] hover:bg-[hsl(var(--grad-green-dark))]">
              {saving ? ui("جارٍ الحفظ…") : ui("حفظ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MediaUrlsEditor = ({
  urls, single, onChange,
}: { urls: string[]; single: boolean; onChange: (u: string[]) => void }) => {
  const { ui } = useLocale();
  const [draft, setDraft] = useState("");
  const add = () => {
    const u = draft.trim();
    if (!u) return;
    onChange(single ? [u] : [...urls, u]);
    setDraft("");
  };
  const remove = (i: number) => onChange(urls.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <Label>{single ? ui("رابط الصورة") : ui("روابط الصور")}</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={ui("الصق رابطاً https://.../image.jpg")}
          dir="ltr"
        />
        <Button type="button" onClick={add} className="bg-[hsl(var(--grad-green))] hover:bg-[hsl(var(--grad-green-dark))]">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {urls.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {urls.map((u, i) => (
            <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border-2 border-[hsl(var(--grad-green))]/30 bg-[hsl(var(--grad-green))]/5">
              <img src={u} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 left-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        {ui("ارفع الصورة على أي مستضيف صور وألصق الرابط المباشر هنا.")}
      </p>
    </div>
  );
};

export default EventLiveProgram;

const SegmentRow = ({
  s, i, total, onUp, onDown, onToggle, onEdit, onRemove,
}: {
  s: ProgramSegment; i: number; total: number;
  onUp: () => void; onDown: () => void; onToggle: () => void;
  onEdit: () => void; onRemove: () => void;
}) => {
  const { ui } = useLocale();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-4 border-2 transition-all ${isDragging ? "ring-2 ring-[hsl(var(--grad-green))]" : ""} ${
        s.enabled ? "border-[hsl(var(--grad-green))]/30 bg-white" : "border-gray-200 bg-gray-50 opacity-70"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex flex-col items-center gap-1 pt-1 cursor-grab active:cursor-grabbing touch-none"
          title={ui("اسحب لإعادة الترتيب")}
          aria-label={ui("مقبض السحب")}
        >
          <GripVertical className="h-4 w-4 text-[hsl(var(--grad-green-dark))]" />
          <span className="text-[10px] font-bold text-[hsl(var(--grad-green-dark))] tabular-nums">#{i + 1}</span>
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ${
          s.kind === "video" ? "bg-gradient-to-br from-[hsl(var(--grad-gold))] to-[hsl(var(--grad-gold-dark))]" : "bg-gradient-to-br from-[hsl(var(--grad-green))] to-[hsl(var(--grad-green-dark))]"
        }`}>
          {KIND_ICON[s.kind]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-[hsl(var(--grad-green-ink))]">{s.title}</h3>
            <span className="text-[10px] font-bold bg-[hsl(var(--grad-green))]/10 text-[hsl(var(--grad-green-dark))] px-2 py-0.5 rounded-full">
              {SEGMENT_KIND_LABEL[s.kind]}
            </span>
            <span className="text-[10px] font-bold bg-[hsl(var(--grad-gold))]/10 text-[hsl(var(--grad-gold-dark))] px-2 py-0.5 rounded-full">
              {s.duration_seconds} {ui("ث")}
            </span>
            {(s.kind === "image" || s.kind === "gallery") && (
              <span className="text-[10px] text-muted-foreground">{s.media_urls.length} {ui("صورة")}</span>
            )}
          </div>
          {s.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={onUp} disabled={i === 0} title={ui("أعلى")}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDown} disabled={i === total - 1} title={ui("أسفل")}>
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onToggle} title={s.enabled ? ui("إخفاء") : ui("إظهار")}>
            {s.enabled ? <Eye className="h-4 w-4 text-[hsl(var(--grad-green-dark))]" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onEdit} title={ui("تعديل")}>
            <Pencil className="h-4 w-4 text-[hsl(var(--grad-green-dark))]" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onRemove} title={ui("حذف")}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
