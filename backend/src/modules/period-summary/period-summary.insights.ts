import type { Insight, PeriodSummary, SkippedInsight } from './period-summary.types';

/**
 * Plain-Arabic, auto-generated management notes for «ملخص الفترة». Every note is one sentence
 * with the number, why it matters and (when useful) a suggestion. A note only appears when it is
 * noteworthy; a required note whose source data does not exist is reported in `skipped` instead.
 */

const AR = 'ar-EG';

function lastDayOfMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
}
export const DISCOUNT_THRESHOLD_PCT = 30;
export const LOW_ATTENDANCE_PCT = 30;
export const LONG_FREEZE_DAYS = 60;

export function fmtMoney(value: number): string {
  return `${new Intl.NumberFormat(AR, { maximumFractionDigits: 0 }).format(Math.round(value))} جنيه`;
}

export function fmtNum(value: number): string {
  return new Intl.NumberFormat(AR, { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function fmtPct(value: number): string {
  const digits = Math.abs(value) < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(AR, { maximumFractionDigits: digits }).format(value)}٪`;
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function hourLabel(hour: number | null): string {
  if (hour == null) return '—';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? 'ص' : 'م';
  return `${fmtNum(h12)} ${suffix}`;
}

export { DAY_NAMES };

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return `${MONTHS_AR[(m || 1) - 1]} ${new Intl.NumberFormat(AR, { useGrouping: false }).format(year)}`;
}

type InsightInput = Omit<PeriodSummary, 'insights' | 'skipped'>;

export function buildInsights(data: InsightInput): { insights: Insight[]; skipped: SkippedInsight[] } {
  const insights: Insight[] = [];
  const skipped: SkippedInsight[] = [];
  const skip = (id: string, title: string, reason: string) => skipped.push({ id, title, reason });
  const { current, previous, discounts: d, outstanding: o, renewal: r, attendance: a, freezes: f } = data;
  const sectionNote = data.filters.gender ? ' (للقسم المختار)' : '';
  const sectioned = data.filters.gender != null;
  const cmp = (cur: number, prev: number) => (data.previousAvailable ? pctChange(cur, prev) : null);

  // ── 1. Discounts ────────────────────────────────────────────────────────────────────────────
  if (d.totalCount === 0) {
    skip('discount-volume', 'حجم الخصومات', 'لا توجد اشتراكات مسجلة في الفترة');
  } else if (d.discountTotal <= 0) {
    skip('discount-volume', 'حجم الخصومات', 'لا توجد خصومات مسجلة على اشتراكات الفترة');
  } else {
    const ofGross = d.discountShareOfGross ?? 0;
    const prevPart =
      data.previousAvailable && d.prevDiscountShareOfGross != null && Math.abs(ofGross - d.prevDiscountShareOfGross) >= 2
        ? ` مقابل ${fmtPct(d.prevDiscountShareOfGross)} في الفترة السابقة`
        : '';
    if (ofGross >= 5 || (d.share ?? 0) >= 20) {
      insights.push({
        id: 'discount-volume',
        tone: ofGross >= 10 ? 'bad' : 'warn',
        title: 'حجم الخصومات',
        text:
          `اشتراكات بقيمة ${fmtMoney(d.grossTotal)} قبل الخصم، اتخصم منها ${fmtMoney(d.discountTotal)} ` +
          `(${fmtPct(ofGross)} من القيمة${prevPart}) على ${fmtNum(d.discountedCount)} اشتراك من ${fmtNum(d.totalCount)} ` +
          `(${fmtPct(d.share ?? 0)})، فالسؤال للإدارة: هل موافقين إن الخصم يكون بالحجم ده؟ ` +
          `والاقتراح تحديد سقف خصم لكل موظف وأي خصم أعلى منه يحتاج موافقة المدير.`,
      });
    }

    const top = d.topEmployees.filter((e) => e.amount > 0).slice(0, 3);
    if (top.length) {
      const topShare = d.discountTotal > 0 ? (top[0].amount / d.discountTotal) * 100 : 0;
      insights.push({
        id: 'discount-employees',
        tone: topShare >= 30 ? 'warn' : 'info',
        title: 'أكثر الموظفين منحاً للخصم',
        text:
          `أكبر الخصومات جت من ${top
            .map((e) => `${e.name} (${fmtMoney(e.amount)} على ${fmtNum(e.count)} اشتراك، متوسط ${fmtPct(e.avgPct)})`)
            .join('، ')}` +
          (topShare >= 30 ? `، والأول لوحده عليه ${fmtPct(topShare)} من كل الخصومات` : '') +
          `، ويُفضّل مراجعة أسباب الخصومات دي معاهم.`,
      });
    }

    if (d.aboveThresholdCount > 0) {
      insights.push({
        id: 'discount-threshold',
        tone: 'bad',
        title: `خصومات أعلى من ${fmtPct(d.threshold)}`,
        text:
          `${fmtNum(d.aboveThresholdCount)} اشتراك اتعمل لهم خصم ${fmtPct(d.threshold)} أو أكتر بإجمالي ${fmtMoney(d.aboveThresholdAmount)}، ` +
          `ودي نسبة كبيرة بتقلل الإيراد، فالأفضل إن أي خصم بالحجم ده يبقى بموافقة مسبقة.`,
      });
    }
  }

  // ── 2. Outstanding money ──────────────────────────────────────────────────────────────────
  if (o.amount > 0) {
    insights.push({
      id: 'outstanding',
      tone: o.olderThan30Amount > 0 ? 'bad' : 'warn',
      title: 'فلوس متبقية على الأعضاء',
      text:
        `فيه ${fmtMoney(o.amount)} متبقية على ${fmtNum(o.members)} عضو${sectionNote}` +
        (o.olderThan30Amount > 0
          ? `، منها ${fmtMoney(o.olderThan30Amount)} (${fmtNum(o.olderThan30Count)} اشتراك) عدّى عليها أكتر من 30 يوم`
          : '') +
        `، وكل ما الوقت يطول التحصيل بيصعب، فالاقتراح متابعة أسبوعية لقائمة المتبقي مع الريسيبشن.`,
    });
  } else if (current.subscriptions === 0) {
    skip('outstanding', 'الفلوس المتبقية', 'لا توجد اشتراكات في الفترة');
  }

  // ── 3. Renewal rate ───────────────────────────────────────────────────────────────────────
  if (r.ended < 20 || r.rate == null) {
    skip('renewal', 'نسبة التجديد', r.ended === 0 ? 'لا توجد اشتراكات انتهت خلال الفترة' : 'عدد الاشتراكات المنتهية في الفترة أقل من أن يُعطي نسبة موثوقة');
  } else {
    const worst =
      r.worstPackage && r.worstPackage.rate <= r.rate - 10
        ? `، وأضعف باقة في التجديد «${r.worstPackage.name}» (${fmtPct(r.worstPackage.rate)} من ${fmtNum(r.worstPackage.ended)})`
        : '';
    insights.push({
      id: 'renewal',
      tone: r.rate >= 60 ? 'good' : r.rate >= 40 ? 'warn' : 'bad',
      title: 'نسبة التجديد',
      text:
        `من ${fmtNum(r.ended)} اشتراك خلصوا في الفترة جدّد ${fmtNum(r.renewed)}${r.rate < 60 ? ' بس' : ''} (${fmtPct(r.rate)})${worst}` +
        (r.rate < 60 ? '، والاقتراح التواصل مع العضو قبل انتهاء اشتراكه بأسبوع بعرض تجديد.' : '، وده مستوى كويس يستاهل نحافظ عليه.'),
    });
  }

  // ── 4. Low attendance (renewal risk) ──────────────────────────────────────────────────────
  if (a.evaluated === 0) {
    skip('low-attendance', 'ضعف الحضور', 'لا توجد بيانات حضور (باركود) للاشتراكات في الفترة');
  } else if (a.share != null && a.share >= 10 && a.low >= 5) {
    insights.push({
      id: 'low-attendance',
      tone: a.share >= 30 ? 'bad' : 'warn',
      title: 'أعضاء حضورهم ضعيف',
      text:
        `${fmtNum(a.low)} عضو (${fmtPct(a.share)} من ${fmtNum(a.evaluated)}) حضروا أقل من ${fmtPct(a.threshold)} من أيام اشتراكهم، ` +
        `ودول أكتر ناس معرضين ميجددوش، فالاقتراح مكالمة متابعة من الكابتن أو برنامج تمرين يشجعهم يرجعوا.`,
    });
  }

  // ── 5. Branch expenses vs revenue growth ──────────────────────────────────────────────────
  if (sectioned) {
    skip('expense-growth', 'مصروفات بتزيد أسرع من الإيراد', 'المصروفات غير مقسمة رجالي/حريمي — اختاري «الكل» لعرضها');
    skip('top-expense', 'أكبر بند مصروفات', 'المصروفات غير مقسمة رجالي/حريمي — اختاري «الكل» لعرضها');
  } else if (current.expenses <= 0) {
    skip('expense-growth', 'مصروفات بتزيد أسرع من الإيراد', 'لا توجد مصروفات مُرحّلة في الحسابات للفترة');
    skip('top-expense', 'أكبر بند مصروفات', 'لا توجد مصروفات مُرحّلة في الحسابات للفترة');
  } else {
    const growthRows = data.branches
      .map((b) => ({
        b,
        rev: cmp(b.revenue, b.prevRevenue),
        exp: cmp(b.expenses, b.prevExpenses),
      }))
      .filter((x): x is { b: typeof x.b; rev: number; exp: number } => x.rev != null && x.exp != null)
      .filter((x) => x.exp > 0 && x.exp - x.rev >= 10)
      .sort((x, y) => y.exp - y.rev - (x.exp - x.rev));
    if (growthRows.length) {
      const g = growthRows[0];
      insights.push({
        id: 'expense-growth',
        tone: 'warn',
        title: 'مصروفات بتزيد أسرع من الإيراد',
        text:
          `مصروفات فرع ${g.b.branchName} زادت ${fmtPct(g.exp)} عن الفترة السابقة بينما الإيراد ${g.rev >= 0 ? 'زاد' : 'قلّ'} ${fmtPct(Math.abs(g.rev))} بس` +
          (growthRows.length > 1 ? ` (ونفس الملاحظة على ${growthRows.slice(1).map((x) => x.b.branchName).join(' و')})` : '') +
          `، فده بيأكل من الربح ومحتاج مراجعة بنود المصروفات في الفرع ده.`,
      });
    }

    const topExpense = data.expenseBreakdown[0];
    if (topExpense && current.revenue > 0) {
      const share = (topExpense.value / current.revenue) * 100;
      if (share >= 10) {
        insights.push({
          id: 'top-expense',
          tone: share >= 35 ? 'warn' : 'info',
          title: 'أكبر بند مصروفات',
          text:
            `أكبر بند مصروفات هو «${topExpense.name.trim()}» بـ${fmtMoney(topExpense.value)}، يعني ${fmtPct(share)} من الإيرادات` +
            `${share >= 35 ? '، وده رقم كبير يستاهل نشوف هل ممكن يتقلل' : ''}.`,
        });
      }
    }
  }

  // ── 6. Best / worst month ─────────────────────────────────────────────────────────────────
  // Only complete months with real activity: the running month and data gaps (a month with a
  // fraction of the usual revenue) would always "win" worst month for the wrong reason.
  const runningMonth = data.filters.today.slice(0, 7);
  const active = data.monthly.filter((m) => m.revenue > 0 && m.month < runningMonth);
  const sortedRevenue = active.map((m) => m.revenue).sort((x, y) => x - y);
  const median = sortedRevenue.length ? sortedRevenue[Math.floor(sortedRevenue.length / 2)] : 0;
  const months = active.filter(
    (m) => m.revenue >= median * 0.25 && (m.month !== data.filters.end.slice(0, 7) || data.filters.end.endsWith(lastDayOfMonth(m.month))),
  );
  if (months.length >= 3) {
    const avgRev = months.reduce((s, m) => s + m.revenue, 0) / months.length;
    const avgExp = months.reduce((s, m) => s + m.expenses, 0) / months.length;
    // A section has no expenses of its own, so its months are ranked by revenue.
    const score = (m: (typeof months)[number]) => (sectioned ? m.revenue : m.profit);
    const byProfit = [...months].sort((x, y) => score(y) - score(x));
    const best = byProfit[0];
    const worst = byProfit[byProfit.length - 1];
    const why = (m: (typeof months)[number], good: boolean) => {
      const revDiff = pctChange(m.revenue, avgRev) ?? 0;
      const expDiff = pctChange(m.expenses, avgExp) ?? 0;
      const revDriven = sectioned || Math.abs(revDiff) >= Math.abs(expDiff);
      if (good) {
        return revDriven
          ? `لأن الإيراد كان أعلى من المتوسط الشهري بـ${fmtPct(Math.max(revDiff, 0))} (${fmtNum(m.subscriptions)} اشتراك)`
          : `لأن المصروفات كانت أقل من المتوسط بـ${fmtPct(Math.max(-expDiff, 0))}`;
      }
      return revDriven
        ? `لأن الإيراد كان أقل من المتوسط الشهري بـ${fmtPct(Math.max(-revDiff, 0))} (${fmtNum(m.subscriptions)} اشتراك بس)`
        : `لأن المصروفات كانت أعلى من المتوسط بـ${fmtPct(Math.max(expDiff, 0))}`;
    };
    insights.push({
      id: 'best-worst-month',
      tone: 'info',
      title: 'أحسن وأضعف شهر',
      text:
        `أحسن شهر ${monthLabel(best.month)} ${sectioned ? `بإيراد ${fmtMoney(best.revenue)}` : `بصافي ${fmtMoney(best.profit)}`} ${why(best, true)}، ` +
        `وأضعف شهر ${monthLabel(worst.month)} ${sectioned ? `بإيراد ${fmtMoney(worst.revenue)}` : `بصافي ${fmtMoney(worst.profit)}`} ${why(worst, false)}، ` +
        `فممكن نجهّز عروض أو حملات قبل الشهر الضعيف ده السنة الجاية.`,
    });
  } else {
    skip('best-worst-month', 'أحسن وأضعف شهر', 'الفترة فيها أقل من 3 شهور كاملة بحركة فعلية');
  }

  // ── 7. Peak days / hours ──────────────────────────────────────────────────────────────────
  const peakRows = data.peaks.filter((p) => p.checkins >= 100 && p.topDay && p.topHour != null);
  if (peakRows.length) {
    insights.push({
      id: 'peaks',
      tone: 'info',
      title: 'أوقات الذروة',
      text:
        `أوقات الزحمة: ${peakRows
          .map((p) => `${p.branchName} يوم ${p.topDay} الساعة ${hourLabel(p.topHour)}${p.quietHour != null ? ` (وأهدى وقت ${hourLabel(p.quietHour)})` : ''}`)
          .join('، ')}، ` + `فالأفضل توزيع الكباتن والريسيبشن على الأوقات دي.`,
    });
  } else {
    skip('peaks', 'أوقات الذروة', 'لا توجد تسجيلات حضور كافية في الفترة');
  }

  // ── 8. Freezes ────────────────────────────────────────────────────────────────────────────
  if (f.count === 0 && f.prevCount === 0) {
    skip('freezes', 'التجميد', 'لا توجد عمليات تجميد في الفترة');
  } else {
    const change = cmp(f.count, f.prevCount);
    const unusual = f.longFreezes > 0 || f.repeatMembers > 0;
    if ((change != null && Math.abs(change) >= 20) || unusual) {
      insights.push({
        id: 'freezes',
        tone: change != null && change >= 20 ? 'warn' : 'info',
        title: 'التجميد',
        text:
          `اتعمل ${fmtNum(f.count)} تجميد بإجمالي ${fmtNum(f.totalDays)} يوم` +
          (f.avgDays != null ? ` (متوسط ${fmtNum(f.avgDays)} يوم)` : '') +
          (change != null ? ` مقابل ${fmtNum(f.prevCount)} في الفترة السابقة (${change >= 0 ? '+' : '−'}${fmtPct(Math.abs(change))})` : '') +
          (f.longFreezes > 0 ? `، منهم ${fmtNum(f.longFreezes)} تجميد أطول من ${fmtNum(LONG_FREEZE_DAYS)} يوم` : '') +
          (f.repeatMembers > 0 ? ` و${fmtNum(f.repeatMembers)} عضو جمّد أكتر من مرة` : '') +
          (f.longFreezes > 0
            ? '، والتجميد الطويل بيأجل الإيراد فيستاهل مراجعة سياسته.'
            : f.repeatMembers > 0
              ? '، والتجميد المتكرر لنفس العضو يستاهل نتأكد إنه في حدود سياسة الباقة.'
              : '.'),
      });
    }
  }

  // ── 9. New members ────────────────────────────────────────────────────────────────────────
  const nm = cmp(current.newMembers, previous.newMembers);
  if (nm != null && Math.abs(nm) >= 10) {
    insights.push({
      id: 'new-members',
      tone: nm > 0 ? 'good' : 'warn',
      title: 'الأعضاء الجدد',
      text:
        `الأعضاء الجدد ${fmtNum(current.newMembers)} مقابل ${fmtNum(previous.newMembers)} في الفترة السابقة (${nm > 0 ? 'زيادة' : 'نقص'} ${fmtPct(Math.abs(nm))})` +
        (nm > 0 ? '، يعني التسويق شغال كويس.' : '، فمحتاجين نراجع التسويق وعروض الاشتراك الجديد.'),
    });
  }

  // ── 10. Revenue trend (context for the rest) ──────────────────────────────────────────────
  const rev = cmp(current.revenue, previous.revenue);
  if (rev != null && Math.abs(rev) >= 10) {
    insights.unshift({
      id: 'revenue-trend',
      tone: rev > 0 ? 'good' : 'bad',
      title: 'اتجاه الإيراد',
      text:
        `إجمالي الإيراد ${fmtMoney(current.revenue)} مقابل ${fmtMoney(previous.revenue)} في الفترة السابقة (${rev > 0 ? 'زيادة' : 'نقص'} ${fmtPct(Math.abs(rev))})` +
        (current.margin != null ? ` وهامش الربح ${fmtPct(current.margin)}.` : '.'),
    });
  }

  if (!data.previousAvailable) {
    skip('comparisons', 'المقارنة بالفترة السابقة', 'الفترة السابقة لا تحتوي على بيانات كافية في النظام');
  }

  return { insights, skipped };
}
