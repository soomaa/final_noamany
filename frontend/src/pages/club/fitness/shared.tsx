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

import type { ColumnDef } from '@tanstack/react-table';
import { MemberCell } from '@/components/club/member-cell';
import type { MemberRowFields } from '@/types/fitness';
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
  onEdit: () => void;
  onDelete: () => void;
}

export function RowActions({ editLabel, deleteLabel, onEdit, onDelete }: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => afterMenuClose(onEdit)}>
          <Pencil className="size-4" /> {editLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={() => afterMenuClose(onDelete)}>
          <Trash2 className="size-4" /> {deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
