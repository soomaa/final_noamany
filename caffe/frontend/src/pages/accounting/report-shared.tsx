import { toArabicDigits } from '@/lib/utils';

export function StatementSection({
  title,
  total,
  items,
}: {
  title: string;
  total: number;
  items: Array<{ name: string; amount: number }>;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3 font-medium">
        {title}: {toArabicDigits(total.toFixed(2))}
      </div>
      <ul className="divide-y p-2 text-sm">
        {items.map((i) => (
          <li key={i.name} className="flex justify-between px-2 py-2">
            <span>{i.name}</span>
            <span className="nums">{toArabicDigits(i.amount.toFixed(2))}</span>
          </li>
        ))}
        {items.length === 0 && <li className="px-2 py-4 text-center text-muted-foreground">—</li>}
      </ul>
    </div>
  );
}
