import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { afterMenuClose } from '@/lib/confirm';
import { useLocation } from 'react-router-dom';
import { usePermission } from '@/hooks/use-permission';

import type { ColumnDef } from '@tanstack/react-table';
import { MemberCell } from '@/components/club/member-cell';
import type { InbodyMeasurementRow, MemberRowFields } from '@/types/fitness';
import { uiStatic } from '@/lib/ui-static';

export const INBODY_SETTLEMENT_LABELS: Record<InbodyMeasurementRow['settlementSource'], string> = {
  subscription: uiStatic('ضمن اشتراك الجيم'),
  package: uiStatic('من باقة InBody'),
  package_purchase: uiStatic('شراء باقة InBody'),
  paid_single: uiStatic('قياس مدفوع'),
  legacy: uiStatic('سجل سابق'),
};
export function memberColumnDef<T extends MemberRowFields & { customerName?: string | null }>(
  header: string,
): ColumnDef<T> {
  return {
    id: 'member',
    header,
    cell: ({ row }) => (
      <MemberCell
        name={row.original.memberName ?? row.original.customerName}
        code={row.original.memberCode}
        memberId={row.original.memberId}
        profilePicture={row.original.memberProfilePicture}
        fallback={row.original.customerName}
      />
    ),
  };
}

export const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

const PAGE_SIZE = 200;

/** Fetch all pages for select dropdowns (no silent 200-row cap). */
export function useFitnessResourceList<T>(resource: string) {
  const query = useQuery({
    queryKey: [resource, 'full-catalog'],
    queryFn: async () => {
      let page = 1;
      let all: T[] = [];
      let total = 0;
      do {
        const { data } = await api.get<{ data: T[]; total: number }>(`/${resource}`, {
          params: { page, pageSize: PAGE_SIZE },
        });
        all = [...all, ...data.data];
        total = data.total;
        page += 1;
      } while (all.length < total && page <= 50);
      return all;
    },
  });
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function linesToJsonArray(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function jsonArrayToLines(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join('\n');
  if (value == null) return '';
  return String(value);
}

interface RowActionsProps {
  editLabel: string;
  deleteLabel: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function RowActions({ editLabel, deleteLabel, onEdit, onDelete }: RowActionsProps) {
  const { pathname } = useLocation();
  const { can, isReady, hasError, resourceForRoute } = usePermission();
  const resource = resourceForRoute(pathname);
  const showEdit = Boolean(onEdit && isReady && !hasError && resource && can(`${resource}:update`));
  const showDelete = Boolean(onDelete && isReady && !hasError && resource && can(`${resource}:delete`));
  if (!showEdit && !showDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {showEdit && onEdit ? <DropdownMenuItem onSelect={() => afterMenuClose(onEdit)}>
          <Pencil className="size-4" /> {editLabel}
        </DropdownMenuItem> : null}
        {showEdit && showDelete ? <DropdownMenuSeparator /> : null}
        {showDelete && onDelete ? <DropdownMenuItem className="text-destructive" onSelect={() => afterMenuClose(onDelete)}>
          <Trash2 className="size-4" /> {deleteLabel}
        </DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
