import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Check, X, Search } from "lucide-react";
import { useEventSettings } from "./useEventSettings";
import { addTitleToSettings, getTitlesList } from "./titleUtils";
import { toast } from 'sonner';
import { useEventLiveContext } from './event-live-context';
import { useLocale } from '@/store/locale';

const ADD_VALUE = "__add_new__";
const NONE_VALUE = "__none__";

interface TitleSelectProps {
  value: string;
  onChange: (v: string) => void;
  /** Tailwind classes for the trigger (height/border). */
  triggerClassName?: string;
  placeholder?: string;
}

/**
 * Reusable dropdown of guest titles (الألقاب) — managed in event settings.
 * Includes "إضافة لقب جديد" inline action that persists to DB and selects it.
 */
export const TitleSelect = ({
  value,
  onChange,
  triggerClassName = "h-12",
  placeholder,
}: TitleSelectProps) => {
  const { ui } = useLocale();
  const { eventId } = useEventLiveContext();
  const resolvedPlaceholder = placeholder ?? ui("اختر اللقب");
  const { settings } = useEventSettings();
    const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const titles = getTitlesList(settings);
  const filteredTitles = query.trim()
    ? titles.filter((t) => t.toLowerCase().includes(query.trim().toLowerCase()))
    : titles;

  const confirmAdd = async () => {
    const t = newTitle.trim();
    if (!t) return;
    setSaving(true);
    const res = await addTitleToSettings(eventId, settings, t);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || ui('تعذر إضافة اللقب'));
      return;
    }
    onChange(t);
    setNewTitle('');
    setAdding(false);
    toast.success(`${ui('تمت إضافة اللقب:')} ${t}`);
  };

  if (adding) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={ui("مثال: المعالي")}
          className={triggerClassName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmAdd();
            }
            if (e.key === "Escape") {
              setAdding(false);
              setNewTitle("");
            }
          }}
        />
        <Button
          type="button"
          onClick={confirmAdd}
          disabled={saving || !newTitle.trim()}
          className="bg-[#7CB342] hover:bg-[#558B2F] text-white shrink-0"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setAdding(false);
            setNewTitle("");
          }}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || NONE_VALUE}
      onValueChange={(v) => {
        if (v === ADD_VALUE) {
          setAdding(true);
          return;
        }
        onChange(v === NONE_VALUE ? "" : v);
      }}
    >
      <SelectTrigger className={triggerClassName} dir="rtl">
        <SelectValue placeholder={resolvedPlaceholder} />
      </SelectTrigger>
      <SelectContent dir="rtl" side="bottom">
        <div className="sticky top-0 z-10 bg-popover p-2 border-b">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={ui("ابحث عن لقب...")}
              className="h-9 pr-8 text-sm"
            />
          </div>
        </div>
        <SelectItem value={NONE_VALUE}>{ui('بدون لقب')}</SelectItem>
        {filteredTitles.map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
        {filteredTitles.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground text-center">
            {ui('لا توجد نتائج')}
          </div>
        )}
        <SelectItem value={ADD_VALUE} className="text-[#558B2F] font-bold">
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {ui('إضافة لقب جديد')}
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
};