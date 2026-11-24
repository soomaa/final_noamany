import { useQuery } from '@tanstack/react-query';
import { toPng } from 'html-to-image';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Info,
  Lightbulb,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { Insight, PeriodSummary } from '@/types/period-summary';

/**
 * «ملخص الفترة» — one Power-BI-style page for the annual management meeting.
 *
 * The report is a fixed-width (1440px), always-light canvas: on screen it is scaled down to fit,
 * and «تنزيل كصورة» exports exactly that canvas as a 2× PNG — what you see is what you download.
 */

const CANVAS_W = 1440;
const C = {
  ink: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
  soft: '#f8fafc',
  brand: '#ED1C24',
  revenue: '#0f766e',
  expense: '#e11d48',
  profit: '#2563eb',
  good: '#059669',
  bad: '#dc2626',
  warn: '#d97706',
};
const PIE_COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#64748b'];
const EXPENSE_COLORS = ['#e11d48', '#f97316', '#eab308', '#8b5cf6', '#0ea5e9', '#64748b', '#14b8a6', '#a3a3a3'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

type Preset = 'this-year' | 'last-year' | 'this-quarter' | 'last-quarter' | 'custom';
type Gender = 'all' | 'male' | 'female';

const nf = (digits = 0) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: digits });
const fmt = (v: number) => nf().format(Math.round(Number.isFinite(v) ? v : 0));
const compact = (v: number) => new Intl.NumberFormat('ar-EG', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${nf(Math.abs(v) < 10 ? 1 : 0).format(v)}٪`);
const change = (cur: number, prev: number) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : null);

function arDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${nf().format(d)} ${MONTHS_AR[m - 1]} ${new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(y)}`;
}
function monthShort(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_AR[m - 1]} ${String(y).slice(2)}`;
}

function presetRange(preset: Exclude<Preset, 'custom'>): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3);
  if (preset === 'this-year') return [`${y}-01-01`, localToday()];
  if (preset === 'last-year') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (preset === 'this-quarter') return [localDateStr(new Date(y, q * 3, 1)), localToday()];
  const lastQ = q === 0 ? 3 : q - 1;
  const lastY = q === 0 ? y - 1 : y;
  return [localDateStr(new Date(lastY, lastQ * 3, 1)), localDateStr(new Date(lastY, lastQ * 3 + 3, 0))];
}

// ─── Report building blocks (plain hex colors: the canvas never follows dark mode) ─────────────

function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-white p-5', className)} style={{ borderColor: C.line }}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-extrabold" style={{ color: C.ink }}>{title}</h3>
        {subtitle && <span className="text-[12px]" style={{ color: C.muted }}>{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Delta({ cur, prev, invert, show }: { cur: number; prev: number; invert?: boolean; show: boolean }) {
  const value = show ? change(cur, prev) : null;
  if (value == null) return <span className="text-[12px]" style={{ color: C.muted }}>لا توجد مقارنة</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: Math.abs(value) < 0.5 ? C.muted : good ? C.good : C.bad }}>
      <Icon className="size-4" />
      {pct(Math.abs(value))}
      <span className="font-medium" style={{ color: C.muted }}>عن الفترة السابقة</span>
    </span>
  );
}

function Kpi({ label, value, unit, cur, prev, invert, show, extra, accent }: {
  label: string; value: string; unit?: string; cur: number; prev: number; invert?: boolean; show: boolean; extra?: string; accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-white px-4 pb-4 pt-5" style={{ borderColor: C.line }}>
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: accent }} />
      <p className="text-[13px] font-bold" style={{ color: C.muted }}>{label}</p>
      <p className="nums mt-1.5 text-[28px] font-black leading-tight" style={{ color: C.ink }}>
        {value}
        {unit && <span className="ms-1 text-[13px] font-bold" style={{ color: C.muted }}>{unit}</span>}
      </p>
      {extra && <p className="mt-0.5 text-[12px] font-semibold" style={{ color: C.muted }}>{extra}</p>}
      <div className="mt-2"><Delta cur={cur} prev={prev} invert={invert} show={show} /></div>
    </div>
  );
}

const TONE: Record<Insight['tone'], { icon: LucideIcon; color: string; bg: string }> = {
  bad: { icon: AlertOctagon, color: C.bad, bg: '#fef2f2' },
  warn: { icon: AlertTriangle, color: C.warn, bg: '#fffbeb' },
  good: { icon: CheckCircle2, color: C.good, bg: '#ecfdf5' },
  info: { icon: Info, color: C.profit, bg: '#eff6ff' },
};

function InsightItem({ insight }: { insight: Insight }) {
  const tone = TONE[insight.tone];
  const Icon = tone.icon;
  return (
    <div className="flex gap-3 rounded-xl p-3.5" style={{ background: tone.bg }}>
      <Icon className="mt-0.5 size-5 shrink-0" style={{ color: tone.color }} />
      <div>
        <p className="text-[14px] font-extrabold" style={{ color: tone.color }}>{insight.title}</p>
        <p className="mt-1 text-[14px] leading-7" style={{ color: C.ink }}>{insight.text}</p>
      </div>
    </div>
  );
}

function Table({ head, rows, highlight }: { head: string[]; rows: Array<Array<React.ReactNode>>; highlight?: (index: number) => string | undefined }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr style={{ color: C.muted }}>
          {head.map((h) => <th key={h} className="border-b px-2 py-2 text-start font-bold" style={{ borderColor: C.line }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: highlight?.(i) }}>
            {row.map((cell, j) => (
              <td key={j} className={cn('nums border-b px-2 py-2', j === 0 && 'font-bold')} style={{ borderColor: C.line, color: C.ink }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function axisMoney(v: number) {
  return compact(v);
}

export function PeriodSummaryReport({ data }: { data: PeriodSummary }) {
  const { filters: f, current: cur, previous: prev, previousAvailable: show } = data;
  const monthly = data.monthly.map((m) => ({ ...m, label: monthShort(m.month) }));
  const expenseTop = useMemo(() => {
    const rows = data.expenseBreakdown.filter((e) => e.value > 0);
    const top = rows.slice(0, 7);
    const rest = rows.slice(7).reduce((s, e) => s + e.value, 0);
    return (rest > 0 ? [...top, { name: 'أخرى', value: rest }] : top).map((e) => ({ ...e, name: e.name.trim() }));
  }, [data.expenseBreakdown]);
  const revenueTotal = data.revenueBreakdown.reduce((s, r) => s + r.value, 0);
  const branches = data.branches;
  const bestBranch = branches.length > 1 ? branches[0]?.branchId : null;
  const worstBranch = branches.length > 1 ? branches[branches.length - 1]?.branchId : null;
  const yoyMonthly = data.yoy.monthly.map((m) => ({ ...m, label: MONTHS_AR[Number(m.month.slice(5, 7)) - 1] }));
  const yoyYear = (Number(f.start.slice(0, 4)) - 1).toString();
  const curYear = f.start.slice(0, 4);
  const sectioned = f.gender != null;

  return (
    <div dir="rtl" className="bg-[#f3f4f6] p-8 font-sans" style={{ width: CANVAS_W, color: C.ink }}>
      {/* Header */}
      <header className="mb-6 flex items-center justify-between gap-6 rounded-2xl bg-white px-7 py-5" style={{ border: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-5">
          <img src="/noamany-logo-clean.png" alt="Noamany" className="h-[62px] w-auto" crossOrigin="anonymous" />
          <div className="h-12 w-px" style={{ background: C.line }} />
          <div>
            <h1 className="text-[30px] font-black leading-tight">ملخص الفترة</h1>
            <p className="mt-1 text-[16px] font-bold" style={{ color: C.muted }}>
              من {arDate(f.start)} إلى {arDate(f.end)} <span className="font-medium">({fmt(f.days)} يوم)</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <span className="rounded-full px-4 py-1.5 text-[14px] font-extrabold text-white" style={{ background: C.brand }}>الفروع: {f.branchLabel}</span>
            <span className="rounded-full px-4 py-1.5 text-[14px] font-extrabold" style={{ background: '#111827', color: '#fff' }}>القسم: {f.genderLabel}</span>
          </div>
          <p className="text-[12px]" style={{ color: C.muted }}>
            المقارنة بالفترة السابقة: {arDate(f.prevStart)} – {arDate(f.prevEnd)}
            {!show && ' (لا توجد بيانات كافية)'}
          </p>
        </div>
      </header>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-6 gap-4">
        <Kpi label="إجمالي الإيرادات" value={fmt(cur.revenue)} unit="ج.م" cur={cur.revenue} prev={prev.revenue} show={show} accent={C.revenue} />
        <Kpi label={sectioned ? 'المصروفات (الفرع كله)' : 'المصروفات'} value={fmt(cur.expenses)} unit="ج.م" cur={cur.expenses} prev={prev.expenses} invert show={show} accent={C.expense} />
        <Kpi label="صافي الربح" value={fmt(cur.netProfit)} unit="ج.م" extra={`هامش الربح ${pct(cur.margin)}`} cur={cur.netProfit} prev={prev.netProfit} show={show} accent={C.profit} />
        <Kpi label="عدد الاشتراكات" value={fmt(cur.subscriptions)} cur={cur.subscriptions} prev={prev.subscriptions} show={show} accent="#7c3aed" />
        <Kpi label="الأعضاء الجدد" value={fmt(cur.newMembers)} extra="أول اشتراك للعضو في الفترة" cur={cur.newMembers} prev={prev.newMembers} show={show} accent="#db2777" />
        <Kpi label="المتبقي (غير مدفوع)" value={fmt(cur.outstanding)} unit="ج.م" extra={`${fmt(data.outstanding.members)} عضو`} cur={cur.outstanding} prev={prev.outstanding} invert show={show} accent={C.warn} />
      </div>

      {/* Insights */}
      <section className="mb-5 rounded-2xl border-2 bg-white p-5" style={{ borderColor: '#fecaca' }}>
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb className="size-6" style={{ color: C.brand }} />
          <h2 className="text-[20px] font-black">ملاحظات واقتراحات للإدارة</h2>
          <span className="text-[13px]" style={{ color: C.muted }}>— مكتوبة تلقائياً من بيانات الفترة، وبتظهر بس لو فيه حاجة تستاهل</span>
        </div>
        {data.insights.length ? (
          <div className="grid grid-cols-2 gap-3">
            {data.insights.map((insight) => <InsightItem key={insight.id} insight={insight} />)}
          </div>
        ) : (
          <p className="text-[14px]" style={{ color: C.muted }}>مفيش ملاحظات لافتة في الفترة دي.</p>
        )}
      </section>

      {/* Revenue vs expenses + revenue breakdown */}
      <div className="mb-5 grid grid-cols-12 gap-5">
        <Card title="الإيرادات مقابل المصروفات شهرياً" subtitle="جنيه" className="col-span-8">
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: C.muted }} reversed />
                <YAxis orientation="right" tickFormatter={axisMoney} tick={{ fontSize: 12, fill: C.muted }} width={56} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="revenue" name="الإيرادات" fill={C.revenue} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="expenses" name="المصروفات" fill={C.expense} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Line dataKey="profit" name="صافي الربح" stroke={C.profit} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="مصادر الإيراد" className="col-span-4">
          <div className="flex items-center gap-3">
            <div style={{ width: 170, height: 170 }}>
              <PieChart width={170} height={170}>
                <Pie data={data.revenueBreakdown} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
                  {data.revenueBreakdown.map((r, i) => <Cell key={r.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </div>
            <ul className="flex-1 space-y-2.5">
              {data.revenueBreakdown.map((r, i) => (
                <li key={r.key} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2 font-bold"><span className="size-3 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{r.name}</span>
                  <span className="nums">{fmt(r.value)} <span style={{ color: C.muted }}>({pct(revenueTotal ? (r.value / revenueTotal) * 100 : 0)})</span></span>
                </li>
              ))}
            </ul>
          </div>
          {sectioned && <p className="mt-3 text-[12px]" style={{ color: C.muted }}>البار والمنتجات غير محسوبة في فلتر القسم.</p>}
        </Card>
      </div>

      {/* Expenses + branches */}
      <div className="mb-5 grid grid-cols-12 gap-5">
        <Card title="المصروفات حسب البند" subtitle={sectioned ? 'للفرع كله' : undefined} className="col-span-5">
          {expenseTop.length ? (
            <ul className="space-y-3">
              {expenseTop.map((e, i) => {
                const max = expenseTop[0].value || 1;
                return (
                  <li key={e.name}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="line-clamp-1 font-bold">{e.name}</span>
                      <span className="nums shrink-0">
                        {fmt(e.value)} <span style={{ color: C.muted }}>({pct(cur.expenses ? (e.value / cur.expenses) * 100 : 0)})</span>
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full" style={{ background: C.soft }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, (e.value / max) * 100)}%`, background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-[13px]" style={{ color: C.muted }}>لا توجد مصروفات مُرحّلة في الفترة.</p>}
        </Card>
        <Card title="مقارنة الفروع" subtitle="الأفضل بالأخضر والأضعف بالأحمر (حسب صافي الربح)" className="col-span-7">
          <Table
            head={['الفرع', 'الإيرادات', 'المصروفات', 'صافي الربح', 'الهامش', 'الاشتراكات', 'أعضاء جدد']}
            rows={branches.map((b) => [
              b.branchName,
              fmt(b.revenue),
              fmt(b.expenses),
              <span key="p" style={{ color: b.profit < 0 ? C.bad : C.ink, fontWeight: 800 }}>{fmt(b.profit)}</span>,
              pct(b.revenue > 0 && Math.abs(b.profit / b.revenue) <= 1 ? (b.profit / b.revenue) * 100 : null),
              fmt(b.subscriptions),
              fmt(b.newMembers),
            ])}
            highlight={(i) => (branches[i].branchId === bestBranch ? '#ecfdf5' : branches[i].branchId === worstBranch ? '#fef2f2' : undefined)}
          />
          {data.notes.map((note) => <p key={note} className="mt-2 text-[12px]" style={{ color: C.muted }}>{note}</p>)}
        </Card>
      </div>

      {/* Durations + packages */}
      <div className="mb-5 grid grid-cols-12 gap-5">
        <Card title="الاشتراكات حسب المدة" className="col-span-5">
          <Table
            head={['المدة', 'العدد', 'القيمة قبل الخصم', 'الخصم', 'المحصّل']}
            rows={data.durations.map((d) => [d.label, fmt(d.count), fmt(d.gross), `${fmt(d.discount)} (${pct(d.gross ? (d.discount / d.gross) * 100 : 0)})`, fmt(d.paid)])}
          />
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Mini label="اشتراكات بخصم" value={pct(data.discounts.share)} sub={`${fmt(data.discounts.discountedCount)} من ${fmt(data.discounts.totalCount)}`} />
            <Mini label="الخصم من القيمة" value={pct(data.discounts.discountShareOfGross)} sub={`${fmt(data.discounts.discountTotal)} ج.م`} tone={C.bad} />
            <Mini label={`خصم ≥ ${pct(data.discounts.threshold)}`} value={fmt(data.discounts.aboveThresholdCount)} sub={`${fmt(data.discounts.aboveThresholdAmount)} ج.م`} tone={C.warn} />
          </div>
        </Card>
        <Card title="أداء الباقات" subtitle="أعلى 10 باقات حسب المحصّل" className="col-span-7">
          <Table
            head={['الباقة', 'العدد', 'المحصّل', 'متوسط الخصم', 'نسبة التجديد']}
            rows={data.packages.slice(0, 10).map((p) => [
              <span key="n" className="line-clamp-1">{p.name}</span>,
              fmt(p.count),
              fmt(p.paid),
              pct(p.discountPct),
              p.renewalRate == null ? '—' : <span key="r" style={{ color: p.renewalRate < 40 ? C.bad : p.renewalRate >= 60 ? C.good : C.ink, fontWeight: 700 }}>{pct(p.renewalRate)}</span>,
            ])}
          />
        </Card>
      </div>

      {/* YoY + operations */}
      <div className="grid grid-cols-12 gap-5">
        <Card title="مقارنة بنفس الفترة من السنة اللي فاتت" subtitle={data.yoy.available ? `إيرادات ${curYear} مقابل ${yoyYear}` : undefined} className="col-span-7">
          {data.yoy.available ? (
            <>
              <div className="mb-3 grid grid-cols-4 gap-3 text-center">
                <Mini label="الإيرادات" value={pct(change(cur.revenue, data.yoy.totals.revenue))} sub={`${fmt(data.yoy.totals.revenue)} ج.م السنة اللي فاتت`} tone={cur.revenue >= data.yoy.totals.revenue ? C.good : C.bad} signed />
                <Mini label="المصروفات" value={pct(change(cur.expenses, data.yoy.totals.expenses))} sub={`${fmt(data.yoy.totals.expenses)} ج.م`} tone={cur.expenses <= data.yoy.totals.expenses ? C.good : C.bad} signed />
                <Mini label="صافي الربح" value={pct(change(cur.netProfit, data.yoy.totals.netProfit))} sub={`${fmt(data.yoy.totals.netProfit)} ج.م`} tone={cur.netProfit >= data.yoy.totals.netProfit ? C.good : C.bad} signed />
                <Mini label="الاشتراكات" value={pct(change(cur.subscriptions, data.yoy.totals.subscriptions))} sub={`${fmt(data.yoy.totals.subscriptions)} اشتراك`} tone={cur.subscriptions >= data.yoy.totals.subscriptions ? C.good : C.bad} signed />
              </div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yoyMonthly} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: C.muted }} reversed />
                    <YAxis orientation="right" tickFormatter={axisMoney} tick={{ fontSize: 12, fill: C.muted }} width={56} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="previous" name={yoyYear} fill="#cbd5e1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="current" name={curYear} fill={C.revenue} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="text-[14px]" style={{ color: C.muted }}>
              مفيش بيانات كافية في النظام لنفس الفترة من السنة اللي فاتت ({arDate(f.yoyStart)} – {arDate(f.yoyEnd)}).
            </p>
          )}
        </Card>
        <Card title="التشغيل والعضوية" className="col-span-5">
          <div className="grid grid-cols-2 gap-3 text-center">
            <Mini label="نسبة التجديد" value={pct(data.renewal.rate)} sub={`${fmt(data.renewal.renewed)} من ${fmt(data.renewal.ended)} اشتراك انتهى`} tone={data.renewal.rate != null && data.renewal.rate < 50 ? C.warn : C.good} />
            <Mini label={`حضور أقل من ${pct(data.attendance.threshold)}`} value={pct(data.attendance.share)} sub={`${fmt(data.attendance.low)} عضو · متوسط الحضور ${pct(data.attendance.avgRate)}`} tone={C.warn} />
            <Mini label="التجميد" value={fmt(data.freezes.count)} sub={`${fmt(data.freezes.totalDays)} يوم · ${fmt(data.freezes.repeatMembers)} عضو جمّد أكتر من مرة`} />
            <Mini label="متبقي أقدم من 30 يوم" value={fmt(data.outstanding.olderThan30Amount)} sub={`${fmt(data.outstanding.olderThan30Count)} اشتراك`} tone={data.outstanding.olderThan30Amount > 0 ? C.bad : C.good} />
          </div>
          {data.peaks.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[13px] font-extrabold">أوقات الذروة</p>
              <Table
                head={['الفرع', 'أزحم يوم', 'أزحم ساعة', 'الحضور']}
                rows={data.peaks.map((p) => [p.branchName, p.topDay ?? '—', hour(p.topHour), fmt(p.checkins)])}
              />
            </div>
          )}
        </Card>
      </div>

      <footer className="mt-5 flex items-start justify-between gap-6 text-[12px]" style={{ color: C.muted }}>
        <div>
          {data.skipped.length > 0 && (
            <p>
              <span className="font-bold">ملاحظات لم تُحسب لعدم توفر البيانات: </span>
              {data.skipped.map((s) => `${s.title} (${s.reason})`).join(' · ')}
            </p>
          )}
        </div>
        <p className="shrink-0">نظام نعماني · {new Date(f.generatedAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      </footer>
    </div>
  );
}

function hour(h: number | null) {
  if (h == null) return '—';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${nf().format(h12)} ${h < 12 ? 'ص' : 'م'}`;
}

function Mini({ label, value, sub, tone, signed }: { label: string; value: string; sub?: string; tone?: string; signed?: boolean }) {
  const shown = signed && value !== '—' && !value.startsWith('-') && !value.startsWith('؜-') ? `+${value}` : value;
  return (
    <div className="rounded-xl px-2 py-3" style={{ background: C.soft, border: `1px solid ${C.line}` }}>
      <p className="text-[12px] font-bold" style={{ color: C.muted }}>{label}</p>
      <p className="nums mt-1 text-[20px] font-black" style={{ color: tone ?? C.ink }}>{shown}</p>
      {sub && <p className="mt-0.5 text-[11px]" style={{ color: C.muted }}>{sub}</p>}
    </div>
  );
}

/** Exports the fixed-width report canvas as a 2× PNG and downloads it. */
export async function exportReportPng(node: HTMLElement, filename: string) {
  await document.fonts?.ready;
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: '#f3f4f6',
    width: CANVAS_W,
    height: node.scrollHeight,
    cacheBust: true,
  });
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
  return dataUrl;
}

// ─── Page ──────────────────────────────────────────────────────────────────────────────────────

/** Scales the fixed-width canvas down to the available width (layout width stays 1440px). */
export function FitToWidth({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>();
  useLayoutEffect(() => {
    const update = () => {
      if (!outer.current || !inner.current) return;
      const next = Math.min(1, outer.current.clientWidth / CANVAS_W);
      setScale(next);
      setHeight(inner.current.scrollHeight * next);
    };
    update();
    const observer = new ResizeObserver(update);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={outer} className="w-full overflow-hidden" style={{ height }}>
      <div ref={inner} style={{ width: CANVAS_W, transform: `scale(${scale})`, transformOrigin: 'top right' }}>{children}</div>
    </div>
  );
}

export function PeriodSummaryPage() {
  const { data: branches = [] } = useBranches();
  const groupsQuery = useQuery({
    queryKey: ['club-branch-groups'],
    queryFn: async () => (await api.get<Array<{ id: number; name: string; isActive: boolean; branchIds: number[] }>>('/club-branch-groups')).data,
    staleTime: 300_000,
    retry: false,
  });
  const groups = (groupsQuery.data ?? []).filter((g) => g.isActive && g.branchIds.length);

  const [preset, setPreset] = useState<Preset>('this-year');
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange('this-year'));
  const [scope, setScope] = useState('all'); // 'all' | 'b:<id>' | 'g:<id>'
  const [gender, setGender] = useState<Gender>('all');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const choosePreset = (next: Preset) => {
    setPreset(next);
    if (next !== 'custom') setRange(presetRange(next));
  };

  const valid = Boolean(from && to && from <= to);
  const query = useQuery({
    queryKey: ['period-summary', from, to, scope, gender],
    queryFn: async () =>
      (await api.get<PeriodSummary>('/period-summary', {
        params: {
          from,
          to,
          ...(scope.startsWith('b:') ? { branchId: scope.slice(2) } : {}),
          ...(scope.startsWith('g:') ? { groupId: scope.slice(2) } : {}),
          ...(gender !== 'all' ? { gender } : {}),
        },
      })).data,
    enabled: valid,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => setExportError(null), [from, to, scope, gender]);

  const download = async () => {
    const node = reportRef.current;
    if (!node || !query.data) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportReportPng(node, `ملخص-الفترة-${query.data.filters.start}-${query.data.filters.end}.png`);
    } catch (error) {
      setExportError(apiError(error) || 'تعذر تجهيز الصورة');
    } finally {
      setExporting(false);
    }
  };

  const presets: Array<[Preset, string]> = [
    ['this-year', 'السنة دي'],
    ['last-year', 'السنة اللي فاتت'],
    ['this-quarter', 'الربع الحالي'],
    ['last-quarter', 'الربع اللي فات'],
    ['custom', 'فترة مخصصة'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">ملخص الفترة</h1>
          <p className="text-sm text-muted-foreground">صفحة واحدة لاجتماع الإدارة: الأرقام والمقارنات والملاحظات، وتتنزل صورة جاهزة للعرض.</p>
        </div>
        <Button onClick={download} disabled={!query.data || exporting} className="gap-2">
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          تنزيل كصورة
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap gap-1.5">
          {presets.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => choosePreset(key)}
              className={cn('rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors', preset === key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-xs font-bold text-muted-foreground">
          من
          <input type="date" value={from} max={to} onChange={(e) => { setPreset('custom'); setRange([e.target.value, to]); }} className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground" />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted-foreground">
          إلى
          <input type="date" value={to} min={from} onChange={(e) => { setPreset('custom'); setRange([from, e.target.value]); }} className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground" />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted-foreground">
          الفرع
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="h-9 min-w-44 rounded-lg border bg-background px-2 text-sm text-foreground">
            <option value="all">كل الفروع</option>
            {branches.map((b) => <option key={b.id} value={`b:${b.id}`}>{b.name}</option>)}
            {groups.length > 0 && (
              <optgroup label="مجموعات الفروع">
                {groups.map((g) => <option key={g.id} value={`g:${g.id}`}>مجموعة {g.name}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <div className="grid gap-1 text-xs font-bold text-muted-foreground">
          القسم
          <div className="flex overflow-hidden rounded-lg border">
            {(['all', 'male', 'female'] as Gender[]).map((g) => (
              <button key={g} type="button" onClick={() => setGender(g)} className={cn('h-9 px-4 text-sm font-bold', gender === g ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted')}>
                {g === 'all' ? 'الكل' : g === 'male' ? 'رجالي' : 'حريمي'}
              </button>
            ))}
          </div>
        </div>
        {!valid && <p className="text-sm font-bold text-destructive">تاريخ البداية لازم يكون قبل تاريخ النهاية</p>}
      </div>

      {exportError && <p className="text-sm font-bold text-destructive">{exportError}</p>}

      {query.isError ? (
        <ErrorState message={apiError(query.error)} onRetry={() => query.refetch()} />
      ) : !query.data ? (
        <Skeleton className="h-[900px] rounded-2xl" />
      ) : (
        <div className={cn('relative rounded-2xl border shadow-sm', query.isFetching && 'opacity-60')}>
          <FitToWidth>
            <div ref={reportRef}>
              <PeriodSummaryReport data={query.data} />
            </div>
          </FitToWidth>
        </div>
      )}
    </div>
  );
}

