import { Link, useParams } from 'react-router-dom';
import { Monitor, QrCode, Settings, ListChecks, Play, ChevronLeft, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/store/locale';

/** إعداد الفعالية — بالترتيب قبل التشغيل */
const SETUP = [
  {
    order: 1,
    key: 'settings',
    icon: Settings,
    label: 'إعدادات العرض',
    desc: 'اسم الفعالية، نصوص الترحيب، الثيم والألوان',
    inShell: true,
  },
  {
    order: 2,
    key: 'program',
    icon: ListChecks,
    label: 'فقرات البرنامج',
    desc: 'جدول الفقرات الذي يظهر على شاشة العرض',
    inShell: true,
  },
] as const;

/** شاشات التشغيل — تُفتح بملء الشاشة على أجهزة العرض */
const RUN = [
  {
    order: 3,
    key: 'checkin',
    icon: QrCode,
    label: 'محطة التسجيل + QR',
    desc: 'اعرضها عند المدخل — الضيوف يمسحون QR من جوالاتهم',
    fullscreen: true,
  },
  {
    order: 4,
    key: 'display',
    icon: Monitor,
    label: 'شاشة العرض الحية',
    desc: 'اعرضها على الشاشة الكبيرة — ترحيب بالحضور والفقرات',
    fullscreen: true,
  },
] as const;

export function EventLiveHub() {
  const { id } = useParams<{ id: string }>();
  const { ui, dir } = useLocale();
  const base = `/club/events/${id}/live`;

  return (
    <div dir={dir} className="space-y-6">
      <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed">
        <p className="font-semibold mb-1">{ui('تسلسل التشغيل')}</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>{ui('اضبط إعدادات العرض والثيم')}</li>
          <li>{ui('أضف فقرات البرنامج (اختياري)')}</li>
          <li>{ui('افتح محطة QR عند المدخل وشاشة العرض على الشاشة الكبيرة')}</li>
          <li>{ui('تابع المسجّلين من تبويب التسجيلات')}</li>
        </ol>
      </div>

      <Tabs defaultValue="setup" dir={dir}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="setup">{ui('الإعداد')}</TabsTrigger>
          <TabsTrigger value="run">{ui('التشغيل')}</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="mt-4 space-y-3">
          {SETUP.map(({ order, key, icon: Icon, label, desc }) => (
            <Card key={key} className="p-4 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                {order}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">{ui(label)}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{ui(desc)}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={`${base}/${key}`}>
                  <ChevronLeft className="h-4 w-4 ml-1" />
                  {ui('فتح')}
                </Link>
              </Button>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="run" className="mt-4 space-y-3">
          {RUN.map(({ order, key, icon: Icon, label, desc, fullscreen }) => (
            <Card key={key} className="p-4 flex items-center gap-4 border-primary/30">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                {order}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">{ui(label)}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{ui(desc)}</p>
              </div>
              <Button asChild size="sm">
                <Link to={`${base}/${key}`} target={fullscreen ? '_blank' : undefined} rel="noreferrer">
                  <Play className="h-4 w-4 ml-1" />
                  {ui('تشغيل')}
                </Link>
              </Button>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground px-1">
            {ui('صفحة تسجيل الضيف تفتح تلقائياً عند مسح QR — لا حاجة لفتحها يدوياً.')}
          </p>
        </TabsContent>
      </Tabs>

      <Card className="p-4 flex items-center justify-between gap-3 bg-muted/20">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{ui('كشف المسجّلين والحضور')}</p>
            <p className="text-xs text-muted-foreground">{ui('إدارة التسجيلات والحضور اليدوي للطاقم')}</p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/club/events/${id}?tab=registrations`}>
            {ui('التسجيلات')}
          </Link>
        </Button>
      </Card>
    </div>
  );
}
