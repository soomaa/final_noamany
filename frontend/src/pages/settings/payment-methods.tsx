import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Image as ImageIcon, Loader2, Pencil, Plus, Trash2, Upload, User, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export interface PaymentMethodItem {
  id: number;
  name: string;
  number: string;
  username: string | null;
  image: string | null;
  isActive: boolean;
  createdAt: string;
}

interface UserOption {
  id: number;
  name: string;
}

interface FormState {
  name: string;
  number: string;
  username: string;
  image: string;
  isActive: boolean;
}

const INITIAL_FORM: FormState = {
  name: '',
  number: '',
  username: '',
  image: '',
  isActive: true,
};

export function PaymentMethodsPage() {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch all payment methods
  const {
    data: items = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['settings', 'payment-methods'],
    queryFn: async () => {
      const res = await api.get<PaymentMethodItem[]>('/payment-methods');
      return res.data;
    },
  });

  // Fetch users for the optional user selector
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'compact-list'],
    queryFn: async () => {
      try {
        const res = await api.get<{ users?: Array<{ user_id?: number; user_name?: string; name?: string; id?: number }> }>('/users');
        const raw = Array.isArray(res.data) ? res.data : res.data.users ?? [];
        return raw.map((u: any) => ({
          id: u.user_id ?? u.id,
          name: u.user_name ?? u.name ?? '',
        })).filter((u: UserOption) => Boolean(u.name));
      } catch {
        return [];
      }
    },
  });

  // Handle Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error(ui('يرجى اختيار ملف صورة صالح'));
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<{ path: string; url?: string }>('/uploads/payment-methods', formData);
      const imagePath = res.data.path || res.data.url || '';
      setForm((prev) => ({ ...prev, image: imagePath }));
      toast.success(ui('تم رفع الصورة بنجاح'));
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = () => {
    setForm((prev) => ({ ...prev, image: '' }));
  };

  // Submit form (create or update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = form.name.trim();
    const number = form.number.trim();

    if (!name) {
      toast.error(ui('الاسم مطلوب'));
      return;
    }

    if (!number) {
      toast.error(ui('الرقم مطلوب'));
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name,
        number,
        username: form.username.trim() || null,
        image: form.image || null,
        isActive: form.isActive,
      };

      if (editingId) {
        await api.patch(`/payment-methods/${editingId}`, payload);
        toast.success(ui('تم تحديث طريقة الدفع بنجاح'));
      } else {
        await api.post('/payment-methods', payload);
        toast.success(ui('تمت إضافة طريقة الدفع بنجاح'));
      }

      setForm(INITIAL_FORM);
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ['settings', 'payment-methods'] });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Start editing
  const handleEdit = (item: PaymentMethodItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      number: item.number,
      username: item.username ?? '',
      image: item.image ?? '',
      isActive: item.isActive,
    });

    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
  };

  // Delete item
  const handleDelete = async (item: PaymentMethodItem) => {
    const ok = await confirm({
      title: ui('حذف طريقة الدفع'),
      description: `${ui('هل أنت متأكد من حذف')} "${item.name}"؟`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });

    if (!ok) return;

    try {
      await api.delete(`/payment-methods/${item.id}`);
      toast.success(ui('تم حذف طريقة الدفع بنجاح'));
      if (editingId === item.id) {
        handleCancelEdit();
      }
      void queryClient.invalidateQueries({ queryKey: ['settings', 'payment-methods'] });
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const getImageUrl = (image: string) => {
    if (!image) return '';
    if (image.startsWith('http://') || image.startsWith('https://')) return image;
    return `/uploads/${image.replace(/^\/?uploads\//, '')}`;
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={ui('طرق الدفع')}
        description={ui('إدارة وتحديد طرق الدفع المتاحة في النظام')}
      />

      {/* نموذج إضافة / تعديل طريقة الدفع */}
      <div ref={formRef}>
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <CreditCard className="size-5 text-primary" />
                {editingId ? ui('تعديل طريقة الدفع') : ui('إضافة طريقة دفع جديدة')}
              </CardTitle>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEdit}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4 ml-1" />
                  {ui('إلغاء التعديل')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                {/* الاسم */}
                <div className="space-y-2">
                  <Label htmlFor="method-name" className="text-sm font-medium">
                    {ui('الاسم')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="method-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={ui('مثال: كاش، مدى، فيزا، تحويل بنكي')}
                    required
                  />
                </div>

                {/* الرقم */}
                <div className="space-y-2">
                  <Label htmlFor="method-number" className="text-sm font-medium">
                    {ui('الرقم')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="method-number"
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                    placeholder={ui('رقم الحساب / المحفظة / الكود')}
                    required
                  />
                </div>

                {/* المستخدم (اختياري) */}
                <div className="space-y-2">
                  <Label htmlFor="method-username" className="text-sm font-medium flex items-center gap-1">
                    <User className="size-3.5 text-muted-foreground" />
                    {ui('المستخدم')}
                    <span className="text-xs text-muted-foreground font-normal">({ui('اختياري')})</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="method-username"
                      list="users-datalist"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder={ui('اختر أو اكتب اسم المستخدم')}
                    />
                    <datalist id="users-datalist">
                      {users.map((u) => (
                        <option key={u.id} value={u.name} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* الحالة نشط / غير نشط */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium block">
                    {ui('الحالة')}
                  </Label>
                  <div className="flex items-center gap-3 h-10 px-3 rounded-md border border-input bg-background/50">
                    <Switch
                      id="method-status"
                      checked={form.isActive}
                      onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                    />
                    <Label htmlFor="method-status" className="cursor-pointer text-sm select-none">
                      {form.isActive ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{ui('نشط')}</span>
                      ) : (
                        <span className="text-muted-foreground">{ui('غير نشط')}</span>
                      )}
                    </Label>
                  </div>
                </div>
              </div>

              {/* الصورة (اختياري) */}
              <div className="space-y-2 pt-2 border-t border-border/30">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <ImageIcon className="size-3.5 text-muted-foreground" />
                  {ui('الصورة')}
                  <span className="text-xs text-muted-foreground font-normal">({ui('اختياري')})</span>
                </Label>

                <div className="flex flex-wrap items-center gap-4">
                  {form.image ? (
                    <div className="relative group size-20 rounded-lg overflow-hidden border border-border shadow-sm bg-muted/30">
                      <img
                        src={getImageUrl(form.image)}
                        alt="طريقة الدفع"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white"
                        title={ui('إزالة الصورة')}
                      >
                        <Trash2 className="size-5 text-red-400" />
                      </button>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="size-4 ml-1.5 animate-spin" />
                          {ui('جاري الرفع...')}
                        </>
                      ) : (
                        <>
                          <Upload className="size-4 ml-1.5" />
                          {form.image ? ui('تغيير الصورة') : ui('رفع صورة')}
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {ui('PNG، JPG، SVG حتى 5 ميجابايت')}
                    </span>
                  </div>
                </div>
              </div>

              {/* أزرار الحفظ */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
                {editingId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    {ui('إلغاء')}
                  </Button>
                )}
                <Button type="submit" disabled={isSaving} className="min-w-32">
                  {isSaving ? (
                    <>
                      <Loader2 className="size-4 ml-2 animate-spin" />
                      {ui('جاري الحفظ...')}
                    </>
                  ) : editingId ? (
                    ui('تحديث')
                  ) : (
                    <>
                      <Plus className="size-4 ml-1" />
                      {ui('حفظ')}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* جدول طرق الدفع كلها */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              {ui('قائمة طرق الدفع')}
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-normal">
                {toArabicDigits(items.length)}
              </span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-8 animate-spin ml-2 text-primary" />
              <span>{ui('جاري تحميل طرق الدفع...')}</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="size-16 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                <CreditCard className="size-8" />
              </div>
              <p className="font-semibold text-foreground text-base mb-1">{ui('لا توجد طرق دفع مضافة حتى الآن')}</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                {ui('قم بتعبئة النموذج أعلاه لإضافة أول طريقة دفع في النظام.')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-medium">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 w-20 text-center">{ui('الصورة')}</th>
                    <th className="py-3 px-4">{ui('الاسم')}</th>
                    <th className="py-3 px-4">{ui('الرقم')}</th>
                    <th className="py-3 px-4">{ui('المستخدم')}</th>
                    <th className="py-3 px-4 text-center">{ui('الحالة')}</th>
                    <th className="py-3 px-4 text-center w-32">{ui('إجراء')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {items.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-muted/30 transition-colors ${
                        editingId === item.id ? 'bg-primary/5' : ''
                      }`}
                    >
                      {/* # */}
                      <td className="py-3 px-4 text-center text-muted-foreground font-mono text-xs">
                        {toArabicDigits(index + 1)}
                      </td>

                      {/* الصورة */}
                      <td className="py-3 px-4 text-center">
                        {item.image ? (
                          <div className="size-10 rounded-md overflow-hidden border border-border/60 mx-auto bg-muted/30">
                            <img
                              src={getImageUrl(item.image)}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="size-10 rounded-md border border-dashed border-border/60 flex items-center justify-center mx-auto text-muted-foreground/50 bg-muted/10">
                            <CreditCard className="size-4" />
                          </div>
                        )}
                      </td>

                      {/* الاسم */}
                      <td className="py-3 px-4 font-medium text-foreground">
                        {item.name}
                      </td>

                      {/* الرقم */}
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {toArabicDigits(item.number)}
                      </td>

                      {/* المستخدم */}
                      <td className="py-3 px-4 text-muted-foreground">
                        {item.username ? (
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3 text-muted-foreground/70" />
                            {item.username}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* الحالة */}
                      <td className="py-3 px-4 text-center">
                        <StatusBadge
                          status={item.isActive ? 'active' : 'suspended'}
                          label={item.isActive ? ui('نشط') : ui('غير نشط')}
                        />
                      </td>

                      {/* إجراء */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => handleEdit(item)}
                            title={ui('تعديل')}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(item)}
                            title={ui('حذف')}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PaymentMethodsPage;
