import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClubEventsLiveApi } from './use-club-events-live-api';
import { useEventLiveBasePath } from './event-live-context';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { Trash2, Search, Users, QrCode, UserCheck, RefreshCw } from "lucide-react";
import { formatNameWithTitle } from "./titleUtils";
import { useLocale } from '@/store/locale';

interface Attendee {
  id: string;
  name: string;
  phone: string | null;
  title: string | null;
  source: string | null;
  checked_in_at: string;
}

export const AttendeesManagerDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const { ui } = useLocale();
  const liveApi = useClubEventsLiveApi();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Attendee | null>(null);

  const { data: rows = [], isFetching: loading, refetch } = useQuery({
    queryKey: ["grad", "attendees"],
    queryFn: async () =>
      (await liveApi.listPrivateAttendees()).data.map(
        (a: {
          id: string;
          name: string;
          phone: string | null;
          title: string | null;
          source: string | null;
          checkedInAt: string;
        }): Attendee => ({
          id: a.id,
          name: a.name,
          phone: a.phone,
          title: a.title,
          source: a.source,
          checked_in_at: a.checkedInAt,
        }),
      ),
    enabled: open,
    refetchInterval: open ? 4000 : false,
  });

  const load = () => refetch();

  const handleDelete = async (a: Attendee) => {
    setBusyId(a.id);
    try {
      await // delete-disabled: liveApi.remove(a.id);
      toast.success(ui("تم الحذف"));
      await qc.invalidateQueries({ queryKey: ["grad", "attendees"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || ui("تعذّر الحذف"));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = rows.filter((r: Attendee) => {
    const term = q.trim();
    if (!term) return true;
    return (
      r.name.includes(term) ||
      (r.phone || "").includes(term) ||
      (r.title || "").includes(term)
    );
  });

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#2E4D1F]">
            <Users className="h-5 w-5 text-[#7CB342]" />
            {ui("سجل الحضور — إدارة وحذف")}
            <span className="text-xs bg-[#7CB342]/10 border border-[#7CB342]/30 text-[#558B2F] font-bold px-2 py-0.5 rounded-full mr-auto">
              {rows.length}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={ui("بحث بالاسم أو الجوال…")}
              className="pr-8"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`} />
            {ui("تحديث")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 mt-2">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">{ui("لا يوجد سجلات")}</div>
          ) : (
            filtered.map((a: Attendee) => {
              const isQr = (a.source || "").toLowerCase() === "qr";
              const t = new Date(a.checked_in_at);
              return (
                <div
                  key={a.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-2.5 rounded-lg border border-[#7CB342]/15 bg-white hover:bg-[#7CB342]/5"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#2E4D1F] truncate">
                      {formatNameWithTitle(a.title, a.name)}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span className="tabular-nums" dir="ltr">{a.phone}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${
                        isQr ? "border-[#558B2F]/40 text-[#558B2F] bg-[#7CB342]/10" : "border-[#A8801F]/40 text-[#A8801F] bg-[#D4A229]/10"
                      }`}>
                        {isQr ? <QrCode className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                        {isQr ? "QR" : ui("مباشر")}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] text-[#558B2F] tabular-nums font-bold text-left">
                    {t.toLocaleString("ar-SA", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hour12: true })}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDelete(a)}
                    disabled={busyId === a.id}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 h-8 w-8 p-0"
                    aria-label={ui("حذف")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
      <AlertDialogContent dir="rtl" className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-700">
            <Trash2 className="h-5 w-5" />
            {ui("تأكيد حذف الحضور")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-right leading-relaxed pt-1">
            {ui("سيتم حذف سجل")}
            {" "}
            <span className="font-extrabold text-[#2E4D1F]">
              «{pendingDelete ? formatNameWithTitle(pendingDelete.title, pendingDelete.name) : ""}»
            </span>
            {" "}
            {ui("نهائياً ولا يمكن التراجع.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>{ui("إلغاء")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={async () => {
              const a = pendingDelete;
              setPendingDelete(null);
              if (a) await handleDelete(a);
            }}
          >
            {ui("حذف نهائي")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default AttendeesManagerDialog;
