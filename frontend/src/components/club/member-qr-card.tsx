import { Copy, Printer } from 'lucide-react';
import { BarcodePreview, isGateQrCredential } from '@/components/club/barcode-label';
import { Button } from '@/components/ui/button';
import { useClubT } from '@/hooks/use-club-t';
import type { ClubMemberListItem } from '@/types/club';

export function MemberQrCard({ member, branch, onCopy, onPrint }: {
  member: ClubMemberListItem;
  branch: string | null;
  onCopy: () => void;
  onPrint?: () => void;
}) {
  const ct = useClubT();
  const available = isGateQrCredential(member.scannerCode);
  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/40">
      <div className="flex flex-1 flex-col items-center px-5 pb-5 pt-6 text-center">
        <h3 className="w-full break-words text-lg font-bold leading-8">{member.name}</h3>
        {branch && <p className="mt-1 text-sm text-muted-foreground">{branch}</p>}
        {!member.isActive && <p className="mt-2 text-sm text-muted-foreground">{ct('common.inactive')}</p>}
        <div className="my-5 flex min-h-52 w-full items-center justify-center">
          <BarcodePreview code={member.memberCode} scannerCode={member.scannerCode} size={208}
            showCode={false} unavailableLabel={ct('members.gateQrUnavailable')} />
        </div>
        <div className="mt-auto space-y-1">
          <p className="text-xs text-muted-foreground">{ct('members.memberCode')}</p>
          <p className="font-mono text-base font-semibold tracking-wider" dir="ltr">{member.memberCode}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t bg-muted/30 p-3">
        <Button type="button" variant="outline" className="min-h-11 flex-1" disabled={!available} onClick={onCopy}>
          <Copy className="size-4" />{ct('packages.copyBarcode')}
        </Button>
        {onPrint && <Button type="button" variant="outline" className="min-h-11 flex-1" disabled={!available} onClick={onPrint}>
          <Printer className="size-4" />{ct('packages.viewPrintBarcode')}
        </Button>}
      </div>
    </article>
  );
}
