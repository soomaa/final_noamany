import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFileUpload, uploadUrl } from '@/components/employees/use-uploads';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';

interface InbodyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: ClubMemberListItem;
}

export function InbodyCreateDialog({ open, onOpenChange, member }: InbodyCreateDialogProps) {
  const ft = useFitnessT();
  const queryClient = useQueryClient();
  const { upload, uploading } = useFileUpload();
  const [saving, setSaving] = useState(false);
  const [measurementDate, setMeasurementDate] = useState(localToday());
  const [reportUrl, setReportUrl] = useState('');
  const { data: nextFileNumber } = useQuery({
    queryKey: ['club-inbody-measurements', 'next-file-number'],
    enabled: open,
    queryFn: async () => (await api.get<{ nextFileNumber: number }>('/club-inbody-measurements/next-file-number')).data.nextFileNumber,
  });

  useEffect(() => {
    if (!open) return;
    setMeasurementDate(localToday());
    setReportUrl('');
  }, [open, member.id]);

  const onPickReport = async (file: File | undefined) => {
    if (!file) return;
    const path = await upload('inbody', file);
    if (path) setReportUrl(path);
  };

  const save = async () => {
    if (!measurementDate || !reportUrl) {
      toast.error(!reportUrl ? 'ارفع ملف القياس أولاً' : 'تاريخ القياس مطلوب');
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-inbody-measurements', {
        memberId: member.id,
        measurementDate,
        reportUrl,
      });
      toast.success(ft('common.success'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['club-inbody-measurements'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>إضافة قياس الأعضاء</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label>رقم الملف</Label>
            <Input className="nums" readOnly value={nextFileNumber ? toArabicDigits(nextFileNumber) : 'جارٍ تحديد الرقم…'} />
          </div>
          <div className="grid gap-2">
            <Label>الاسم</Label>
            <Input readOnly value={member.name} />
          </div>
          <div className="grid gap-2">
            <Label>{ft('common.date')}</Label>
            <Input type="date" className="nums" value={measurementDate} onChange={(event) => setMeasurementDate(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>الملف</Label>
            {reportUrl ? (
              <div className="flex items-center gap-2">
                <a href={uploadUrl(reportUrl) ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand underline">
                  <FileText className="size-4" /> {ft('inbody.viewReport')}
                </a>
                <Button type="button" variant="ghost" size="icon" title={ft('common.delete')} onClick={() => setReportUrl('')}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                <Upload className="size-4" />
                {uploading ? ft('inbody.uploading') : ft('inbody.uploadReport')}
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={uploading} onChange={(event) => void onPickReport(event.target.files?.[0])} />
              </label>
            )}
            <span className="text-xs text-muted-foreground">{ft('inbody.reportHint')}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ft('common.cancel')}</Button>
          <Button variant="brand" onClick={() => void save()} disabled={saving || uploading}>{ft('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
