import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Wand2 } from "lucide-react";
import { useLocale } from '@/store/locale';

type Swatch = { hex: string; hsl: string; count: number };

const toHex = (n: number) => n.toString(16).padStart(2, "0");
const rgbToHex = (r: number, g: number, b: number) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;
const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const extractPalette = (img: HTMLImageElement, k = 8): Swatch[] => {
  const canvas = document.createElement("canvas");
  const size = 160;
  const ratio = Math.min(size / img.naturalWidth, size / img.naturalHeight, 1);
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // skip near-white / near-black
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 245 && min > 245) continue;
    if (max < 15) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key);
    if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.count += 1; }
    else buckets.set(key, { r, g, b, count: 1 });
  }
  const all = Array.from(buckets.values())
    .map((c) => {
      const r = Math.round(c.r / c.count), g = Math.round(c.g / c.count), b = Math.round(c.b / c.count);
      return { hex: rgbToHex(r, g, b), hsl: rgbToHsl(r, g, b), count: c.count };
    })
    .sort((a, b) => b.count - a.count);
  // de-duplicate similar hues
  const out: Swatch[] = [];
  for (const s of all) {
    const h = parseInt(s.hsl.split(" ")[0]);
    if (out.every((o) => Math.abs(parseInt(o.hsl.split(" ")[0]) - h) > 12)) out.push(s);
    if (out.length >= k) break;
  }
  return out;
};

type Props = {
  onApply: (patch: {
    primary_color: string;
    secondary_color: string;
    accent_primary: string;
    accent_gold: string;
    accent_ink: string;
  }) => void;
};

export const BrandColorExtractor = ({ onApply }: Props) => {
  const { ui } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [palette, setPalette] = useState<Swatch[]>([]);
  const [roles, setRoles] = useState<{ primary?: string; secondary?: string; gold?: string; ink?: string }>({});

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const p = extractPalette(img, 8);
      setPalette(p);
      // auto-assign by lightness/saturation
      const sorted = [...p].sort((a, b) => b.count - a.count);
      const next: typeof roles = {};
      next.primary = sorted[0]?.hex;
      next.secondary = sorted[1]?.hex;
      // gold = warmest hue 30-55
      next.gold = p.find((s) => { const h = parseInt(s.hsl.split(" ")[0]); return h >= 30 && h <= 55; })?.hex ?? sorted[2]?.hex;
      // ink = darkest
      next.ink = [...p].sort((a, b) => parseInt(a.hsl.split(" ")[2]) - parseInt(b.hsl.split(" ")[2]))[0]?.hex;
      setRoles(next);
    };
    img.src = url;
  };

  const setRole = (role: keyof typeof roles, hex: string) =>
    setRoles((r) => ({ ...r, [role]: hex }));

  const apply = () => {
    if (!roles.primary || !roles.secondary) return;
    const find = (hex?: string) => palette.find((s) => s.hex === hex);
    onApply({
      primary_color: find(roles.primary)?.hsl ?? "98 84% 47%",
      secondary_color: find(roles.secondary)?.hsl ?? "45 96% 60%",
      accent_primary: roles.primary,
      accent_gold: roles.gold ?? "#D4A229",
      accent_ink: roles.ink ?? "#0A1F3D",
    });
  };

  return (
    <Card className="p-4 space-y-3 border-dashed border-2 border-[#7CB342]/30 bg-[#7CB342]/5">
      <div className="flex items-center justify-between">
        <Label className="font-bold flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-[#558B2F]" />
          {ui('استخراج الهوية من صورة')}
        </Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 ml-1" />
          {ui('رفع صورة')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {ui('ارفع شعار الحفل أو صورة الدعوة لاستخراج الألوان البارزة تلقائياً.')}
      </p>

      {preview && (
        <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
          <img src={preview} alt={ui('مصدر الهوية')} className="w-[120px] h-[120px] object-contain rounded-md border border-border bg-white" />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {palette.map((s) => (
                <div key={s.hex} className="flex flex-col items-center gap-0.5">
                  <span className="w-8 h-8 rounded-md border border-border" style={{ background: s.hex }} title={s.hex} />
                  <span className="text-[9px] font-mono text-muted-foreground" dir="ltr">{s.hex}</span>
                </div>
              ))}
            </div>

            {palette.length > 0 && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(["primary", "secondary", "gold", "ink"] as const).map((role) => (
                  <div key={role} className="space-y-1">
                    <Label className="text-[11px]">
                      {role === "primary" && ui("الأساسي")}
                      {role === "secondary" && ui("الثانوي")}
                      {role === "gold" && ui("الذهبي")}
                      {role === "ink" && ui("الحبر")}
                    </Label>
                    <div className="flex gap-1 flex-wrap">
                      {palette.map((s) => (
                        <button
                          key={s.hex}
                          type="button"
                          onClick={() => setRole(role, s.hex)}
                          className={`w-6 h-6 rounded border-2 transition-transform ${roles[role] === s.hex ? "border-[#558B2F] scale-110" : "border-transparent"}`}
                          style={{ background: s.hex }}
                          aria-label={s.hex}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              onClick={apply}
              disabled={!roles.primary || !roles.secondary}
              size="sm"
              className="bg-[#7CB342] hover:bg-[#558B2F] text-white"
            >
              {ui('تطبيق على التوكنز')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};