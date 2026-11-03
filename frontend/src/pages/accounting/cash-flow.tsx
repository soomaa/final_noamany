import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatMoney, localToday } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { AccountingPageShell } from './accounting-shell';
import {
  monthStart,
  ReportFilters,
  StatementLine,
  StatementTotal,
  useAccountingCurrency,
  type StatementItem,
} from './report-shared';

interface CashFlowBucket {
  inflow: number;
  outflow: number;
  net: number;
  inflowItems: StatementItem[];
  outflowItems: StatementItem[];
}

interface CashFlowResponse {
  operating: CashFlowBucket;
  investing: CashFlowBucket;
  financing: CashFlowBucket;
  netChange: number;
}

const EMPTY_BUCKET: CashFlowBucket = {
  inflow: 0,
  outflow: 0,
  net: 0,
  inflowItems: [],
  outflowItems: [],
};

/**
 * One activity block: the cash received and paid through each counterpart account,
 * then the section's net movement. `title` and `netLabel` arrive already translated.
 */
function CashFlowSection({
  title,
  netLabel,
  bucket,
  currency,
}: {
  title: string;
  netLabel: string;
  bucket: CashFlowBucket;
  currency: string;
}) {
  const { ui } = useLocale();
  return (
    <div>
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      <div className="space-y-3 ps-4">
        <div>
          <h4 className="mb-2 flex items-center gap-2 font-medium">
            <ArrowDown className="h-4 w-4 text-success" />
            {ui('التدفقات الداخلة')}
          </h4>
          {bucket.inflowItems.length > 0 ? (
            bucket.inflowItems.map((item) => (
              <StatementLine
                key={`in-${item.code ?? item.name}`}
                item={item}
                currency={currency}
                tone="success"
              />
            ))
          ) : (
            <div className="py-2 text-center text-muted-foreground">
              {ui('لا توجد تدفقات داخلة')}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-2 font-medium">
            <ArrowUp className="h-4 w-4 text-destructive" />
            {ui('التدفقات الخارجة')}
          </h4>
          {bucket.outflowItems.length > 0 ? (
            bucket.outflowItems.map((item) => (
              <StatementLine
                key={`out-${item.code ?? item.name}`}
                item={item}
                currency={currency}
                tone="destructive"
                signed
              />
            ))
          ) : (
            <div className="py-2 text-center text-muted-foreground">
              {ui('لا توجد تدفقات خارجة')}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 border-t-2 py-2 font-bold">
          <span>{netLabel}</span>
          <span className={`nums ${bucket.net >= 0 ? 'text-success' : 'text-destructive'}`}>
            {formatMoney(bucket.net, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CashFlowPage() {
  const { ui } = useLocale();
  const currency = useAccountingCurrency();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['accounting', 'cash-flow', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<CashFlowResponse>('/accounting/cash-flow', {
        params: {
          dateFrom: startDate,
          dateTo: endDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  const netChange = data?.netChange ?? 0;

  return (
    <AccountingPageShell
      title={ui('قائمة التدفق النقدي')}
      description={ui('تتبع التدفقات النقدية الداخلة والخارجة')}
      actions={
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {ui('تحديث')}
        </Button>
      }
    >
      <ReportFilters
        startDate={startDate}
        endDate={endDate}
        branchId={branchId}
        onStart={setStartDate}
        onEnd={setEndDate}
        onBranch={setBranchId}
        onSearch={() => void refetch()}
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{ui('قائمة التدفق النقدي')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                <CashFlowSection
                  title={ui('الأنشطة التشغيلية')}
                  netLabel={ui('صافي التدفق النقدي من الأنشطة التشغيلية')}
                  bucket={data?.operating ?? EMPTY_BUCKET}
                  currency={currency}
                />
                <CashFlowSection
                  title={ui('الأنشطة الاستثمارية')}
                  netLabel={ui('صافي التدفق النقدي من الأنشطة الاستثمارية')}
                  bucket={data?.investing ?? EMPTY_BUCKET}
                  currency={currency}
                />
                <CashFlowSection
                  title={ui('الأنشطة التمويلية')}
                  netLabel={ui('صافي التدفق النقدي من الأنشطة التمويلية')}
                  bucket={data?.financing ?? EMPTY_BUCKET}
                  currency={currency}
                />

                <StatementTotal
                  label={ui('صافي الزيادة/النقص في النقدية')}
                  icon={Wallet}
                  amount={netChange}
                  currency={currency}
                  tone={netChange >= 0 ? 'success' : 'destructive'}
                  boxTone="primary"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AccountingPageShell>
  );
}
