import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uploadUrl } from '@/components/employees/use-uploads';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLocale } from '@/store/locale';
import { AppCrudPage } from './app-crud';
import { uploadAppImage } from './app-shell';

interface OfferRow {
  id: number;
  title: string;
  description: string | null;
  discount: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  imageUrl: string | null;
}

const EMPTY = { title: '', description: '', discount: '', startDate: '', endDate: '', isActive: true, imageUrl: '' };

export function AppOffersPage() {
  const { ui } = useLocale();
  return (
    <AppCrudPage<OfferRow>
      title={ui('إدارة العروض')}
      description={ui('عروض التطبيق المحمول للأعضاء')}
      resource="app/offers"
      emptyForm={EMPTY}
      columns={[
        { key: 'title', header: ui('العنوان') },
        { key: 'discount', header: ui('الخصم %'), render: (r) => (r.discount != null ? String(r.discount) : '—') },
        { key: 'isActive', header: ui('نشط'), render: (r) => (r.isActive ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={(form) => ({
        title: form.title,
        description: form.description || undefined,
        discount: form.discount ? Number(form.discount) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        isActive: !!form.isActive,
        imageUrl: form.imageUrl || undefined,
      })}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>{ui('العنوان')}</Label>
            <Input value={String(form.title ?? '')} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label>{ui('الوصف')}</Label>
            <Textarea value={String(form.description ?? '')} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>{ui('الخصم %')}</Label>
              <Input className="nums" type="number" value={String(form.discount ?? '')} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>{ui('نشط')}</Label>
              <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>{ui('من')}</Label>
              <Input className="nums" type="date" value={String(form.startDate ?? '')} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>{ui('إلى')}</Label>
              <Input className="nums" type="date" value={String(form.endDate ?? '')} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>{ui('صورة')}</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const url = await uploadAppImage(file);
                setForm({ ...form, imageUrl: url });
              }}
            />
          </div>
        </div>
      )}
    />
  );
}

export function AppTrainersPage() {
  const { ui } = useLocale();
  return (
    <AppCrudPage<{ id: number; name: string; specialization: string | null; phone: string | null; isActive: boolean }>
      title={ui('إدارة المدربين')}
      description={ui('مدربو التطبيق المحمول')}
      resource="app/trainers"
      emptyForm={{ name: '', email: '', phone: '', specialization: '', experience: '', bio: '', isActive: true, imageUrl: '' }}
      columns={[
        { key: 'name', header: ui('الاسم') },
        { key: 'specialization', header: ui('التخصص') },
        { key: 'phone', header: ui('الهاتف') },
        { key: 'isActive', header: ui('نشط'), render: (r) => (r.isActive ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={(form) => ({
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        specialization: form.specialization || undefined,
        experience: form.experience ? Number(form.experience) : undefined,
        bio: form.bio || undefined,
        isActive: !!form.isActive,
        imageUrl: form.imageUrl || undefined,
      })}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{ui('الاسم')}</Label><Input value={String(form.name ?? '')} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('البريد')}</Label><Input value={String(form.email ?? '')} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('الهاتف')}</Label><Input value={String(form.phone ?? '')} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('التخصص')}</Label><Input value={String(form.specialization ?? '')} onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('سنوات الخبرة')}</Label><Input className="nums" type="number" value={String(form.experience ?? '')} onChange={(e) => setForm({ ...form, experience: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('نبذة')}</Label><Textarea value={String(form.bio ?? '')} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
        </div>
      )}
    />
  );
}

export function ExerciseCategoriesPage() {
  const { ui } = useLocale();
  return (
    <AppCrudPage<{ id: number; name: string; description: string | null; isActive: boolean }>
      title={ui('إدارة تصنيفات التمارين')}
      description={ui('تصنيفات مكتبة التمارين')}
      resource="app/exercise-categories"
      emptyForm={{ name: '', description: '', isActive: true }}
      columns={[
        { key: 'name', header: ui('التصنيف') },
        { key: 'isActive', header: ui('نشط'), render: (r) => (r.isActive ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={(form) => ({ name: form.name, description: form.description || undefined, isActive: !!form.isActive })}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{ui('الاسم')}</Label><Input value={String(form.name ?? '')} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('الوصف')}</Label><Textarea value={String(form.description ?? '')} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
      )}
    />
  );
}

export function AppExercisesPage() {
  const { ui } = useLocale();
  const { data: categoriesRes } = useQuery({
    queryKey: ['app', 'exercise-categories'],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>('/app/exercise-categories', {
        params: { page: 1, pageSize: 200 },
      });
      return data.data ?? [];
    },
  });
  const categories = categoriesRes ?? [];

  return (
    <AppCrudPage<{ id: number; name: string; categoryName: string; difficulty: string | null; isActive: boolean }>
      title={ui('إدارة التمارين')}
      description={ui('تمارين مكتبة اللياقة في التطبيق')}
      resource="app/exercises"
      emptyForm={{ name: '', categoryId: '', description: '', instructions: '', duration: '', difficulty: 'easy', isActive: true }}
      columns={[
        { key: 'name', header: ui('التمرين') },
        { key: 'categoryName', header: ui('التصنيف') },
        { key: 'difficulty', header: ui('الصعوبة') },
        { key: 'isActive', header: ui('نشط'), render: (r) => (r.isActive ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={(form) => ({
        name: form.name,
        categoryId: Number(form.categoryId),
        description: form.description || undefined,
        instructions: form.instructions || undefined,
        duration: form.duration ? Number(form.duration) : undefined,
        difficulty: form.difficulty || undefined,
        isActive: !!form.isActive,
        imageUrl: form.imageUrl || undefined,
      })}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{ui('الاسم')}</Label><Input value={String(form.name ?? '')} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-1">
            <Label>{ui('التصنيف')}</Label>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={String(form.categoryId ?? '')}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">{ui('— اختر التصنيف —')}</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1"><Label>{ui('الوصف')}</Label><Textarea value={String(form.description ?? '')} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('التعليمات')}</Label><Textarea value={String(form.instructions ?? '')} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label>{ui('المدة (د)')}</Label><Input className="nums" type="number" value={String(form.duration ?? '')} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></div>
            <div className="grid gap-1">
              <Label>{ui('الصعوبة')}</Label>
              <select className="rounded-md border bg-background px-3 py-2 text-sm" value={String(form.difficulty ?? 'easy')} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="easy">{ui('سهل')}</option>
                <option value="medium">{ui('متوسط')}</option>
                <option value="hard">{ui('صعب')}</option>
              </select>
            </div>
          </div>
        </div>
      )}
    />
  );
}

export function AppNewsPage() {
  const { ui } = useLocale();
  return (
    <AppCrudPage<{ id: number; title: string; newsType: 'nutrition' | 'championships' | 'exercises' | 'supplements'; publishDate: string | null; isPublished: boolean }>
      title={ui('إدارة الأخبار')}
      description={ui('أخبار النادي في التطبيق')}
      resource="app/news"
      emptyForm={{ title: '', content: '', newsType: 'nutrition', publishDate: '', isPublished: false, imageUrl: '', imageCleared: false }}
      columns={[
        { key: 'title', header: ui('العنوان') },
        { key: 'newsType', header: ui('النوع'), render: (r) => ui({ nutrition: 'تغذية', championships: 'بطولات', exercises: 'تمارين', supplements: 'مكملات' }[r.newsType as 'nutrition' | 'championships' | 'exercises' | 'supplements'] ?? '—') },
        { key: 'publishDate', header: ui('تاريخ النشر') },
        { key: 'isPublished', header: ui('منشور'), render: (r) => (r.isPublished ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={(form) => ({
        title: form.title,
        content: form.content,
        newsType: form.newsType,
        publishDate: form.publishDate || undefined,
        isPublished: !!form.isPublished,
        imageUrl: form.imageCleared ? null : form.imageUrl || undefined,
      })}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{ui('العنوان')}</Label><Input value={String(form.title ?? '')} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid gap-1">
            <Label>{ui('النوع')}</Label>
            <Select value={String(form.newsType ?? 'nutrition')} onValueChange={(newsType) => setForm({ ...form, newsType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nutrition">{ui('تغذية')}</SelectItem>
                <SelectItem value="championships">{ui('بطولات')}</SelectItem>
                <SelectItem value="exercises">{ui('تمارين')}</SelectItem>
                <SelectItem value="supplements">{ui('مكملات')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1"><Label>{ui('المحتوى')}</Label><Textarea rows={5} value={String(form.content ?? '')} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('تاريخ النشر')}</Label><Input className="nums" type="date" value={String(form.publishDate ?? '')} onChange={(e) => setForm({ ...form, publishDate: e.target.value })} /></div>
          <div className="grid gap-2">
            <Label>{ui('الصورة (اختياري)')}</Label>
            {form.imageUrl ? <img src={uploadUrl(String(form.imageUrl)) ?? ''} alt={ui('معاينة الخبر')} className="h-32 w-48 rounded-lg border bg-muted object-cover" /> : null}
            <Input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const imageUrl = await uploadAppImage(file);
                setForm({ ...form, imageUrl, imageCleared: false });
              }}
            />
            {form.imageUrl ? <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setForm({ ...form, imageUrl: '', imageCleared: true })}>{ui('إزالة الصورة')}</Button> : null}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />{ui('منشور')}</label>
        </div>
      )}
    />
  );
}

export function AppAdsPage() {
  const { ui } = useLocale();
  return (
    <AppCrudPage<{ id: number; title: string; linkUrl: string | null; isActive: boolean }>
      title={ui('إدارة الإعلانات')}
      description={ui('إعلانات البنر في التطبيق')}
      resource="app/ads"
      emptyForm={{ title: '', description: '', linkUrl: '', startDate: '', endDate: '', isActive: false, imageUrl: '' }}
      columns={[
        { key: 'title', header: ui('العنوان') },
        { key: 'linkUrl', header: ui('الرابط') },
        { key: 'isActive', header: ui('نشط'), render: (r) => (r.isActive ? ui('نعم') : ui('لا')) },
      ]}
      toPayload={(form) => ({
        title: form.title,
        description: form.description || undefined,
        linkUrl: form.linkUrl || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        isActive: !!form.isActive,
        imageUrl: form.imageUrl || undefined,
      })}
      renderForm={(form, setForm) => (
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{ui('العنوان')}</Label><Input value={String(form.title ?? '')} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('الوصف')}</Label><Textarea value={String(form.description ?? '')} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{ui('رابط')}</Label><Input value={String(form.linkUrl ?? '')} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label>{ui('من')}</Label><Input className="nums" type="date" value={String(form.startDate ?? '')} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="grid gap-1"><Label>{ui('إلى')}</Label><Input className="nums" type="date" value={String(form.endDate ?? '')} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
        </div>
      )}
    />
  );
}
