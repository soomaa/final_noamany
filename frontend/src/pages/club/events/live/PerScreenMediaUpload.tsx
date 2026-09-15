import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { Trash2, Link2 } from "lucide-react";
import { isVideoUrl, GraduationScreen, resolveBackdropUrl } from "./EventLiveBackdrop";
import { EventSettings } from "./useEventSettings";
import { useClubEventsLiveApi } from './use-club-events-live-api';
import { useEventLiveBasePath } from './event-live-context';
import { useLocale } from '@/store/locale';

type Props = {
  screen: GraduationScreen;
  label: string;
  column: keyof EventSettings;
  settings: EventSettings;
  onSaved: (url: string | null) => void;
};

/**
 * Single per-screen slot: paste a direct image/video URL → save to settings,
 * or reset to default. (Direct file upload isn't available; host media externally
 * and paste the link.)
 */
export const PerScreenMediaUpload = ({ screen, label, column, settings, onSaved }: Props) => {
  const { ui } = useLocale();
  const liveApi = useClubEventsLiveApi();
  const [busy, setBusy] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const current = (settings[column] as string | null) ?? null;
  const hasOverride = !!current && (current.startsWith("http") || current.startsWith("/"));
  const preview = resolveBackdropUrl(settings, screen);
  const video = isVideoUrl(preview);

  const save = async (val: string | null) => {
    setBusy(true);
    try {
      await liveApi.update({ [column]: val });
      onSaved(val);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || ui("تعذّر الحفظ"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-3 p-2 rounded-lg bg-muted/40 border border-border">
      <div className="w-[88px] aspect-[9/16] rounded-md overflow-hidden bg-muted border border-border">
        {video ? (
          <video src={preview} muted autoPlay loop playsInline className="w-full h-full object-cover" />
        ) : (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#2E4D1F] truncate">{label}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {hasOverride ? (video ? ui("وسائط مخصصة (فيديو)") : ui("وسائط مخصصة (صورة)")) : ui("يستخدم الخلفية الافتراضية")}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {hasOverride && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => save(null)}
                className="h-8 text-[11px] font-bold text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5 ml-1" />
                {ui('افتراضي')}
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={ui("ألصق رابط صورة أو فيديو مباشر (https://...)")}
            dir="ltr"
            className="h-8 text-[12px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const u = urlInput.trim();
                if (u) {
                  save(u);
                  setUrlInput("");
                }
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !urlInput.trim()}
            onClick={async () => {
              const u = urlInput.trim();
              if (!u) return;
              await save(u);
              setUrlInput("");
              toast.error(`${ui('تم تطبيق الرابط على')} «${label}»` || ui("تم الحفظ"));
            }}
            className="h-8 text-[11px] font-bold border-[#7CB342] text-[#2E4D1F]"
          >
            <Link2 className="h-3.5 w-3.5 ml-1" />
            {ui('حفظ')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PerScreenMediaUpload;
