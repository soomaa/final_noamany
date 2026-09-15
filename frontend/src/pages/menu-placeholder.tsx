import { Construction, Home } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { resolveRoute } from '@/lib/routes';
import { useHomeRoute } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';

export function MenuPlaceholderPage() {
  const { ui } = useLocale();
  const { homeRoute } = useHomeRoute();
  const { link } = useParams<{ link: string }>();
  const decoded = link ? decodeURIComponent(link) : '';
  const mapped = resolveRoute(decoded);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={ui('قيد التطوير')} description={decoded} eyebrow={ui('قائمة النظام')} />
      <Card className="overflow-hidden border-dashed border-primary/20 shadow-sm">
        <div className="h-1 bg-gradient-to-l from-primary/60 via-primary to-primary/40" />
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Construction className="size-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{ui('هذه الشاشة لم تُربط بعد')}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {ui('الرابط')} <span className="font-mono text-xs text-foreground/80">{decoded}</span> {ui('من القائمة القديمة')}
              {mapped !== `/m/${encodeURIComponent(decoded)}` ? (
                <>{ui('— المسار المقترح:')}<span className="text-primary">{mapped}</span></>
              ) : (
                <>{ui('لم يُعرّف في النظام الجديد بعد.')}</>
              )}
            </p>
          </div>
          <Button variant="brand" asChild>
            <Link to={homeRoute}>
              <Home className="size-4" /> {ui('العودة للوحة التحكم')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
