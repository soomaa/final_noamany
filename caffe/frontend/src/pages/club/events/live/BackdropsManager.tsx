import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { ImagePlus, Link2 } from "lucide-react";
import { useBackdrops } from "./useBackdrops";
import { useLocale } from '@/store/locale';

export const BackdropsManager = () => {
  const { ui } = useLocale();
  const { backdrops, refresh } = useBackdrops();
    const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [urlInput, setUrlInput] = useState("");

  const onAddUrl = async () => {
    const u = urlInput.trim();
    if (!u) return;
    setBusy(true);
    try {
      /* backdrops upload disabled */
      setUrlInput("");
      setLabel("");
      await refresh();
      toast.success(ui("تمت إضافة الخلفية"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || ui("تعذّر الحفظ"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-bold flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-primary" />
          {ui('إضافة خلفية مخصصة جديدة')}
        </Label>
        <span className="text-[10px] text-muted-foreground">{backdrops.length} {ui('خلفية')}</span>
      </div>

      {/* Add form — paste a direct image URL (host the image anywhere and paste the link). */}
      <div className="rounded-xl border-2 border-dashed border-primary/30 p-3 bg-primary/5 space-y-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={ui("اسم الخلفية (اختياري)")}
        />
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={ui("رابط صورة (https://...)")}
            dir="ltr"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddUrl();
              }
            }}
          />
          <Button type="button" onClick={onAddUrl} disabled={busy || !urlInput.trim()} className="bg-[#7CB342] hover:bg-[#558B2F]">
            <Link2 className="h-4 w-4 ml-1" />
            {ui('إضافة')}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {ui('ارفع الصورة على أي مستضيف صور وألصق الرابط المباشر هنا.')}
        </p>
      </div>
    </div>
  );
};

export default BackdropsManager;
