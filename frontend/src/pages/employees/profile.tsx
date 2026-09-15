import { Printer, Pencil } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge, GenderBadge } from '@/components/common/status-badge';
import { DateText, Num } from '@/components/common/formatters';
import { ErrorState, NotImplementedState } from '@/components/common/states';
import {
  BanksTab,
  ContractTab,
  DocumentsTab,
  InsuranceTab,
} from '@/components/employees/employee-profile-tabs';
import { useResource, isNotImplemented } from '@/lib/api-hooks';
import type {
  EmployeeBankRow,
  EmployeeContract,
  EmployeeDocumentFile,
  EmployeeInsurance,
} from '@/types/employees';
import { initials, toArabicDigits } from '@/lib/utils';
import { uploadUrl } from '@/components/employees/use-uploads';
import { useLocale } from '@/store/locale';

interface EmployeeProfile {
  id: number;
  emp_code: number;
  employee: string;
  phone: string | null;
  card_num: string | null;
  edara_n: string | null;
  qsm_n: string | null;
  mosma_wazefy_n: string | null;
  employee_type: 0 | 1 | 2;
  emp_type: 1 | 2;
  gender: number | null;
  birth_date: string | null;
  email: string | null;
  personal_photo: string | null;
  adress: string | null;
  employee_qualification?: string | null;
  previous_experience?: string | null;
  skills?: string | null;
  languages?: string | null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

export function EmployeeProfilePage() {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useResource<EmployeeProfile>('employees', id, 'profile');
  const { data: insurance, isLoading: insuranceLoading } = useResource<EmployeeInsurance>('employees', id, 'insurance');
  const { data: documents, isLoading: docsLoading } = useResource<EmployeeDocumentFile[]>('employees', id, 'documents');
  const { data: banks, isLoading: banksLoading } = useResource<EmployeeBankRow[]>('employees', id, 'banks');
  const { data: contract, isLoading: contractLoading } = useResource<EmployeeContract | null>('employees', id, 'contract');

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('ملف الموظف')} />
        <NotImplementedState title={ui('ملف الموظف قيد الإعداد على الخادم')} />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) return <NotImplementedState title={ui('الموظف غير موجود')} />;

  const status = data.employee_type === 1 ? 'active' : data.employee_type === 2 ? 'suspended' : 'unset';
  const photoUrl = uploadUrl(data.personal_photo);

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.employee}
        description={`${ui('كود الموظف:')} ${toArabicDigits(data.emp_code)}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()} aria-label={ui('طباعة بطاقة الموظف')}>
              <Printer className="size-4" /> {ui('بطاقة الموظف')}
            </Button>
            <Button asChild>
              <Link to={`/employees/${id}/edit`}>
                <Pencil className="size-4" /> {ui('تعديل')}
              </Link>
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden print:shadow-none">
        <div className="bg-brand-gradient p-6 text-white print:bg-none print:text-foreground">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar className="size-24 border-4 border-white/30">
              {photoUrl && <AvatarImage src={photoUrl} alt={data.employee} />}
              <AvatarFallback className="text-2xl" delayMs={photoUrl ? 600 : 0}>
                {initials(data.employee)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-start">
              <h2 className="text-2xl font-bold">{data.employee}</h2>
              <p className="text-white/80 print:text-muted-foreground">{data.mosma_wazefy_n ?? '—'}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <StatusBadge status={status} />
                <GenderBadge gender={data.emp_type} />
              </div>
            </div>
          </div>
        </div>

        <CardContent className="p-6">
          <Tabs defaultValue="personal">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="personal">{ui('البيانات الشخصية')}</TabsTrigger>
              <TabsTrigger value="work">{ui('الوظيفية')}</TabsTrigger>
              <TabsTrigger value="banks">{ui('البنوك')}</TabsTrigger>
              <TabsTrigger value="contract">{ui('العقد')}</TabsTrigger>
              <TabsTrigger value="insurance">{ui('التأمينات')}</TabsTrigger>
              <TabsTrigger value="documents">{ui('المستندات')}</TabsTrigger>
            </TabsList>

            <TabsContent value="personal">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label={ui('رقم الجوال')} value={data.phone ? toArabicDigits(data.phone) : '—'} />
                <Field label={ui('رقم الهوية')} value={data.card_num ? toArabicDigits(data.card_num) : '—'} />
                <Field label={ui('تاريخ الميلاد')} value={<DateText value={data.birth_date} />} />
                <Field label={ui('المؤهل الدراسي')} value={data.employee_qualification ?? '—'} />
                <Field label={ui('الخبرات السابقة')} value={data.previous_experience ?? '—'} />
                <Field label={ui('المهارات')} value={data.skills ?? '—'} />
                <Field label={ui('اللغات')} value={data.languages ?? '—'} />
                <Field label={ui('العنوان')} value={data.adress ?? '—'} />
                <Field label={ui('البريد الإلكتروني')} value={data.email ?? '—'} />
              </dl>
            </TabsContent>

            <TabsContent value="work">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label={ui('الإدارة')} value={data.edara_n ?? '—'} />
                <Field label={ui('القسم')} value={data.qsm_n ?? '—'} />
                <Field label={ui('المسمى الوظيفي')} value={data.mosma_wazefy_n ?? '—'} />
                <Field label={ui('كود الموظف')} value={<Num value={data.emp_code} />} />
              </dl>
            </TabsContent>

            <TabsContent value="banks">
              <BanksTab data={banks} loading={banksLoading} />
            </TabsContent>

            <TabsContent value="contract">
              <ContractTab data={contract} loading={contractLoading} empId={id!} />
            </TabsContent>

            <TabsContent value="insurance">
              <InsuranceTab data={insurance} loading={insuranceLoading} />
            </TabsContent>

            <TabsContent value="documents">
              <DocumentsTab data={documents} loading={docsLoading} />
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

