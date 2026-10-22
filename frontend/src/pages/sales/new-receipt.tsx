import {
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  Minus,
  PackageCheck,
  PackageX,
  PauseCircle,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  PosReceiptPrint,
  type PosReceiptData,
} from "@/components/sales/pos-receipt-print";
import { WarehouseSelect } from '@/components/inventory/warehouse-select';
import { LOGO_SRC } from '@/components/brand/logo';
import { localToday } from '@/lib/formatters';
import { PosCategoryGrid } from "@/components/cafe/pos-category-grid";
import { Combobox } from "@/components/common/combobox";
import {
  dispatchPosPrintJobs,
  resolveCafePrintTemplates,
  type PosPrintTemplate,
} from "@/components/sales/pos-printing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBranches } from "@/hooks/use-branches";
import { usePosEmployeeOptions } from "@/hooks/use-pos-employee-options";
import { api, apiError } from "@/lib/api";
import { resolveProductImageUrl } from "@/lib/product-image";
import { toArabicDigits } from "@/lib/utils";
import { cafeUnitLabel } from "@/lib/cafe-units";
import type { PaginatedResponse } from "@/components/common/data-table";
import type {
  CafeCategory,
  CafeProductListItem,
  CafeProductVariant,
} from "@/types/cafe";
import { useLocale } from "@/store/locale";
import { useAuth } from "@/store/auth";
import { confirm } from "@/lib/confirm";
import { GymSalesPageShell } from "../gym-sales/shell";

interface CartLine {
  inventoryProductId?: number | null;
  cafeProductId: number;
  cafeVariantId?: number;
  variantName?: string;
  itemNote: string;
  name: string;
  productCode: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  productType: CafeProductListItem["productType"];
  currentStock: number | null;
}

interface PosPaymentOption {
  id: number;
  name: string;
  code: string;
  method: string;
  supportsMixedPayment: boolean;
  isEnabled: boolean;
}

interface StockShortageProduct {
  cafeProductId: number | null;
  name: string;
  variantName: string | null;
}

interface StockShortageLine {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  available: number;
  required: number;
  shortage: number;
  canContinueWithNegative: boolean;
  affectedProducts: StockShortageProduct[];
}

interface StockShortageDialogState {
  onHold: boolean;
  canContinueWithNegative: boolean;
  shortages: StockShortageLine[];
  affectedProducts: StockShortageProduct[];
}

const clampPercentage = (value: number) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

export function SalesNewReceiptPage() {
  const { ui } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = Number(searchParams.get("draftId") || 0);
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const { data: branches } = useBranches();
  const { data: employeeOptions = [] } = usePosEmployeeOptions();
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [saleType, setSaleType] = useState<"customer" | "employee" | "partner" | "drawing">(
    "customer",
  );
  const [employeeId, setEmployeeId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [warehouseId, setWarehouseId] = useState('');
  const [drawingRecipient, setDrawingRecipient] = useState('');
  const [drawingReason, setDrawingReason] = useState('');
  const [recommendedEmployeeId, setRecommendedEmployeeId] = useState('');
  const [billingCycle, setBillingCycle] = useState<
    "immediate" | "daily" | "monthly"
  >("immediate");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  /** Customer discount entered as a money amount (default) or a percentage. */
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [mixedCash, setMixedCash] = useState("");
  const [mixedCard, setMixedCard] = useState("");
  const [receiptComment, setReceiptComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [highlightedLineKey, setHighlightedLineKey] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<PosReceiptData | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [variantProduct, setVariantProduct] =
    useState<CafeProductListItem | null>(null);
  const [stockShortage, setStockShortage] =
    useState<StockShortageDialogState | null>(null);
  const [resolvingShortage, setResolvingShortage] = useState<
    "continue" | "disable" | null
  >(null);

  const cartLineKey = (
    line: Pick<CartLine, "cafeProductId" | "cafeVariantId">,
  ) => `${line.cafeProductId}:${line.cafeVariantId ?? "base"}`;

  const assignedBranchId =
    user?.branch && user.branch > 0 ? String(user.branch) : "";
  const effectiveBranchId =
    branchId ||
    (assignedBranchId &&
    (branches ?? []).some((branch) => String(branch.id) === assignedBranchId)
      ? assignedBranchId
      : "") ||
    String(branches?.[0]?.id ?? "");

  const { data: categories } = useQuery({
    queryKey: ["categories", "cafe-pos"],
    queryFn: async () => {
      const { data } = await api.get<
        CafeCategory[] | PaginatedResponse<CafeCategory>
      >("/categories", {
        params: { page: 1, pageSize: 500, status: "active" },
      });
      return (Array.isArray(data) ? data : data.data)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    },
  });

  const {
    data: productPages,
    isLoading: productsLoading,
    hasNextPage: hasMoreProducts,
    fetchNextPage: fetchMoreProducts,
    isFetchingNextPage: loadingMoreProducts,
  } = useInfiniteQuery({
    queryKey: ["cafe-products", "pos", search, categoryId, effectiveBranchId, warehouseId],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data: r } = await api.get<PaginatedResponse<CafeProductListItem>>(
        "/cafe-products",
        {
          params: {
            page: pageParam,
            pageSize: 100,
            search: search || undefined,
            categoryId: categoryId || undefined,
            branchId: effectiveBranchId || undefined,
            warehouseId: warehouseId || undefined,
            sellableOnly: true,
          },
        },
      );
      return r;
    },
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.pageSize < lastPage.total
        ? lastPage.page + 1
        : undefined,
  });
  const products = useMemo(
    () => {
      if (!categoryId) return [];
      return (productPages?.pages ?? [])
        .flatMap((page) => page.data)
        .filter(
          (product) =>
            product.isActive &&
            product.productType !== "internal" &&
            product.categoryId === Number(categoryId),
        );
    },
    [productPages, categoryId],
  );

  const { data: partners } = useQuery({
    queryKey: ["cafe-partners"],
    queryFn: async () => {
      const { data } = await api.get<
        Array<{
          id: number;
          partnerCode: string;
          name: string;
          phone: string | null;
          phones: Array<{ phone: string }>;
          isActive: boolean;
        }>
      >("/cafe-products/partners/list");
      return data.filter((partner) => partner.isActive);
    },
  });
  const partnerOptions = useMemo(
    () =>
      (partners ?? []).map((partner) => {
        const phoneNumbers =
          partner.phones?.map((item) => item.phone).filter(Boolean) ??
          (partner.phone ? [partner.phone] : []);
        return {
          value: String(partner.id),
          label: partner.name,
          description: [partner.partnerCode, phoneNumbers[0]]
            .filter(Boolean)
            .join(" · "),
          searchText: [partner.name, partner.partnerCode, ...phoneNumbers].join(
            " ",
          ),
        };
      }),
    [partners],
  );

  const { data: posSettings } = useQuery({
    queryKey: ["pos-settings", "general", effectiveBranchId],
    queryFn: async () => {
      const { data: r } = await api.get<Array<{ key: string; value: unknown }>>(
        "/pos-settings/general",
        {
          params: effectiveBranchId
            ? { branchId: effectiveBranchId }
            : undefined,
        },
      );
      return r;
    },
  });

  const { data: printTemplateCatalog } = useQuery({
    queryKey: ["pos-invoice-templates", "cafe-printing"],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<PosPrintTemplate>>(
        "/pos-invoice-templates",
        {
          params: { pageSize: 50, isActive: true },
        },
      );
      return data.data ?? [];
    },
  });
  const printTemplates = useMemo(
    () => resolveCafePrintTemplates(printTemplateCatalog ?? []),
    [printTemplateCatalog],
  );

  const { data: draft } = useQuery({
    queryKey: ["quick-sales", "draft", draftId],
    queryFn: async () => (await api.get(`/quick-sales/${draftId}`)).data,
    enabled: draftId > 0,
  });

  const taxPctNum = useMemo(() => {
    const enableTax =
      posSettings?.find((s) => s.key === "enable_tax")?.value !== false;
    if (!enableTax) return 0;
    const rate = posSettings?.find((s) => s.key === "tax_rate")?.value;
    const n = typeof rate === "number" ? rate : Number(rate);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 15;
  }, [posSettings]);

  const configuredCustomerDiscount = clampPercentage(
    Number(
      posSettings?.find(
        (setting) => setting.key === "default_discount_percentage",
      )?.value ?? 0,
    ),
  );
  const configuredEmployeeDiscount = clampPercentage(
    Number(
      posSettings?.find(
        (setting) => setting.key === "employee_discount_percentage",
      )?.value ?? 0,
    ),
  );
  const configuredPartnerDiscount = clampPercentage(
    Number(
      posSettings?.find(
        (setting) => setting.key === "partner_discount_percentage",
      )?.value ?? 0,
    ),
  );

  useEffect(() => {
    if (!posSettings || draftId) return;
    setDiscountPct(
      String(
        saleType === "employee"
          ? configuredEmployeeDiscount
          : saleType === "partner"
            ? configuredPartnerDiscount
          : saleType === "customer"
            ? configuredCustomerDiscount
            : 0,
      ),
    );
  }, [
    configuredCustomerDiscount,
    configuredEmployeeDiscount,
    configuredPartnerDiscount,
    draftId,
    posSettings,
    saleType,
  ]);

  useEffect(() => {
    if (!draft || !products || draftLoaded) return;
    if (draft.status !== "draft") {
      toast.error(ui("هذه الفاتورة لم تعد مسودة"));
      return;
    }
    if (effectiveBranchId !== String(draft.branchId)) {
      setBranchId(String(draft.branchId));
      return;
    }
    setCustomerName(draft.customerName === ui("عميل نقدي") ? "" : (draft.customerName ?? ""));
    setCustomerPhone(draft.customerPhone ?? "");
    setSaleType(draft.saleType ?? "customer");
    setEmployeeId(draft.employeeId ? String(draft.employeeId) : "");
    setPartnerId(draft.partnerId ? String(draft.partnerId) : "");
    setBillingCycle(
      draft.billingCycle ??
        (draft.saleType === "partner"
          ? "monthly"
          : draft.saleType === "employee"
            ? "daily"
            : "immediate"),
    );
    setDiscountPct(String(draft.discountPercentage ?? 0));
    setDiscountMode("amount");
    setDiscountValue(String(draft.discountAmount ?? 0));
    setCategoryId(draft.cafeCategoryId ? String(draft.cafeCategoryId) : "");
    setWarehouseId(draft.warehouseId ? String(draft.warehouseId) : '');
    setGender(draft.gender ?? "");
    setPaymentMethod(draft.paymentMethod ?? "cash");
    setRecommendedEmployeeId(draft.targetEmployeeId ? String(draft.targetEmployeeId) : '');
    setReceiptComment(draft.receiptComment ?? "");
    setCommentOpen(!!draft.receiptComment);
    setCart(
      draft.items.map(
        (item: {
          cafeProductId: number;
          cafeVariantId?: number;
          variantName?: string;
          itemNote?: string | null;
          name: string;
          productCode: string;
          unitPrice: number;
          quantity: number;
        }) => {
          const product = products.find((row) => row.id === item.cafeProductId);
          return {
            cafeProductId: item.cafeProductId,
            cafeVariantId: item.cafeVariantId ?? undefined,
            variantName: item.variantName ?? undefined,
            itemNote: item.itemNote ?? "",
            name: item.name,
            productCode: item.productCode,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            imageUrl: product?.imageUrl ?? null,
            productType: product?.productType ?? "prepared",
            currentStock: product?.currentStock ?? null,
          };
        },
      ),
    );
    setDraftLoaded(true);
  }, [draft, products, draftLoaded, ui, effectiveBranchId]);

  useEffect(() => {
    if (!highlightedLineKey) return;
    const timeout = window.setTimeout(() => setHighlightedLineKey(null), 900);
    return () => window.clearTimeout(timeout);
  }, [highlightedLineKey]);

  const { data: paymentCatalog } = useQuery({
    queryKey: ["pos-payment-methods", "pos"],
    queryFn: async () => {
      const { data: r } = await api.get<
        PaginatedResponse<{
          id: number;
          name: string;
          code: string;
          baseMethod: "cash" | "card" | "wallet" | "transfer";
          isEnabled: boolean;
          supportsMixedPayment: boolean;
        }>
      >("/pos-payment-methods", { params: { pageSize: 100 } });
      return (r.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        method: p.baseMethod,
        supportsMixedPayment: p.supportsMixedPayment,
        isEnabled: p.isEnabled,
      })) as PosPaymentOption[];
    },
  });

  const allowMixed = useMemo(
    () =>
      (paymentCatalog ?? []).some((p) => p.isEnabled && p.supportsMixedPayment),
    [paymentCatalog],
  );

  const paymentOptions = useMemo(() => {
    const allCatalog = paymentCatalog ?? [];
    const catalog = allCatalog.filter((method) => method.isEnabled);
    if (!allCatalog.length) {
      const fallback = [
        { value: "cash", label: ui("نقدي") },
        { value: "card", label: ui("بطاقة") },
        { value: "wallet", label: ui("محفظة") },
        { value: "transfer", label: ui("تحويل") },
      ];
      if (allowMixed) fallback.push({ value: "mixed", label: ui("دفع مختلط") });
      return fallback;
    }
    const seen = new Set<string>();
    const unique = catalog
      .map((p) => ({ value: p.method, label: p.name }))
      .filter((o) => {
        if (seen.has(o.value)) return false;
        seen.add(o.value);
        return true;
      });
    if (allowMixed && !seen.has("mixed")) {
      unique.push({ value: "mixed", label: ui("دفع مختلط") });
    }
    return unique;
  }, [paymentCatalog, allowMixed, ui]);

  useEffect(() => {
    if (
      paymentOptions.length &&
      !paymentOptions.some((option) => option.value === paymentMethod)
    ) {
      setPaymentMethod(paymentOptions[0].value);
    }
  }, [paymentMethod, paymentOptions]);

  const discountPctNum = clampPercentage(
    saleType === 'drawing' ? 0 : saleType === "employee"
        ? configuredEmployeeDiscount
        : saleType === "partner"
          ? configuredPartnerDiscount
        : Number(discountPct),
  );
  const effectiveTaxPct = saleType === 'drawing' ? 0 : taxPctNum;

  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [cart],
  );
  const customerAmountDiscount = saleType === "customer" && discountMode === "amount";
  const discountAmount = customerAmountDiscount
    ? Math.min(Math.max(Number(discountValue) || 0, 0), subtotal)
    : (subtotal * discountPctNum) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = (afterDiscount * effectiveTaxPct) / 100;
  const total = afterDiscount + taxAmount;
  const currency = String(
    posSettings?.find((setting) => setting.key === "currency")?.value ?? "EGP",
  );
  const receiptBusinessName = String(
    posSettings?.find((setting) => setting.key === "receipt_business_name")
      ?.value ?? "Noamany CLUB · CAFE",
  );
  // Always the system's Noamany brand logo (same file as the sidebar).
  const receiptLogoUrl = LOGO_SRC;
  const receiptFooter = String(
    posSettings?.find((setting) => setting.key === "receipt_footer")?.value ??
      ui("شكراً لزيارتكم"),
  );
  const mixedTotal = (Number(mixedCash) || 0) + (Number(mixedCard) || 0);
  const mixedRemaining = Math.round((total - mixedTotal) * 100) / 100;
  const mixedPaymentValid =
    paymentMethod !== "mixed" || Math.abs(mixedRemaining) <= 0.01;
  const deferredBilling =
    saleType === 'drawing' ||
    saleType === "partner" ||
    (saleType === "employee" && billingCycle !== "immediate");

  const addResolvedToCart = (
    p: CafeProductListItem,
    variant?: CafeProductVariant,
  ) => {
    if (!categoryId) {
      toast.error(ui("اختر فئة الفاتورة أولًا"));
      return;
    }
    if (p.categoryId !== Number(categoryId)) {
      toast.error(ui("لا يمكن إضافة منتج من فئة مختلفة إلى الفاتورة"));
      return;
    }
    if (p.productType === "ready" && (p.currentStock ?? 0) <= 0) {
      toast.error(ui("هذا المنتج نفد من المخزون"));
      return;
    }
    const targetKey = `${p.id}:${variant?.id ?? "base"}`;
    setHighlightedLineKey(targetKey);
    setCart((prev) => {
      const idx = prev.findIndex((line) => cartLineKey(line) === targetKey);
      if (idx >= 0) {
        if (
          p.productType === "ready" &&
          prev[idx].quantity >= (p.currentStock ?? 0)
        ) {
          toast.error(ui("لا يمكن إضافة كمية أكبر من الموجود بالمخزون"));
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          cafeProductId: p.id,
          inventoryProductId: p.inventoryProductId,
          cafeVariantId: variant?.id,
          variantName: variant?.name,
          itemNote: "",
          name: p.name,
          productCode: p.productCode,
          unitPrice: variant?.sellPrice ?? p.sellPrice,
          quantity: 1,
          imageUrl: p.imageUrl,
          productType: p.productType,
          currentStock: p.currentStock ?? null,
        },
      ];
    });
  };

  const addToCart = (product: CafeProductListItem) => {
    const variants = product.variants.filter((variant) => variant.isActive);
    if (variants.length) {
      setVariantProduct(product);
      return;
    }
    addResolvedToCart(product);
  };

  const updateQty = (lineKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (cartLineKey(l) !== lineKey) return l;
          const next = l.quantity + delta;
          if (
            l.productType === "ready" &&
            l.currentStock != null &&
            next > l.currentStock
          ) {
            toast.error(ui("لا يمكن إضافة كمية أكبر من الموجود بالمخزون"));
            return l;
          }
          return { ...l, quantity: next };
        })
        .filter((l) => l.quantity > 0),
    );
  };

  const changeBranch = async (nextBranchId: string) => {
    if (nextBranchId === effectiveBranchId || draftId) return;
    if (cart.length) {
      const accepted = await confirm({
        title: ui("تغيير فرع نقطة البيع؟"),
        description: ui(
          "سيتم تفريغ السلة لأن الأسعار والضرائب والمخزون قد تختلف بين الفروع.",
        ),
        warning: ui("لا يمكن نقل طلب موجود إلى فرع آخر."),
        confirmLabel: ui("تغيير الفرع وتفريغ السلة"),
        cancelLabel: ui("البقاء على الفرع الحالي"),
        variant: "destructive",
      });
      if (!accepted) return;
      setCart([]);
      setMixedCash("");
      setMixedCard("");
    }
    setWarehouseId('');
    setRecommendedEmployeeId('');
    setBranchId(nextBranchId);
  };

  const checkout = async (onHold = false, allowIngredientShortage = false) => {
    if (!cart.length || !effectiveBranchId) {
      toast.error(ui("أضف منتجات واختر الفرع"));
      return;
    }
    if (!categoryId) return toast.error(ui("اختر فئة الفاتورة"));
    if (!gender) return toast.error(ui("اختر جنس العميل"));
    if (saleType === 'drawing') {
      if (!drawingRecipient.trim() || !drawingReason.trim()) return toast.error(ui('أدخل المستفيد وسبب المسحوبات'));
      if (cart.some((line) => !line.inventoryProductId || line.productType !== 'ready')) return toast.error(ui('المسحوبات متاحة للمنتجات الجاهزة المرتبطة بالمخزون'));
      if (onHold || draftId) return toast.error(ui('سجل المسحوبات كمستند مستقل'));
      setSaving(true);
      try {
        await api.post('/inventory-transactions/drawings', {
          reference: `DRAW-${crypto.randomUUID()}`, txnType: 'issue', txnDate: localToday(),
          branchId: Number(effectiveBranchId), sourceWarehouseId: warehouseId ? Number(warehouseId) : undefined,
          businessClassification: 'management_withdrawal', recipientName: drawingRecipient.trim(), reason: drawingReason.trim(),
          cafeCategoryId: Number(categoryId), gender,
          items: cart.map((line) => ({ productId: line.inventoryProductId, itemName: line.name, quantity: line.quantity })),
        });
        setCart([]);
        toast.success(ui('تم تسجيل المسحوبات وخصم المخزون'));
        navigate('/sales/drawings');
      } catch (err) { toast.error(apiError(err)); }
      finally { setSaving(false); }
      return;
    }
    if (total < 0) {
      toast.error(ui("الإجمالي غير صالح"));
      return;
    }
    if (saleType === "employee" && !employeeId)
      return toast.error(ui("اختر الموظف"));
    if (saleType === "partner" && !partnerId)
      return toast.error(ui("اختر الشريك"));
    const normalizedPhone = customerPhone.trim().replace(/[\s\-()]/g, "");
    if (
      normalizedPhone &&
      !/^(?:01\d{9}|\+?[1-9]\d{6,14})$/.test(normalizedPhone)
    ) {
      toast.error(ui("رقم الجوال غير صحيح. أدخل رقمًا مثل 01012345678"));
      return;
    }
    if (!onHold && !deferredBilling && !mixedPaymentValid) {
      toast.error(
        ui("مجموع الدفع النقدي والبطاقة يجب أن يساوي إجمالي الفاتورة"),
      );
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        branchId: Number(effectiveBranchId),
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        targetEmployeeId: recommendedEmployeeId && categories?.find((c)=>String(c.id)===categoryId)?.nameAr.includes('بروتين') ? Number(recommendedEmployeeId) : undefined,
        gender,
        cafeCategoryId: Number(categoryId),
        customerName: customerName || ui("عميل نقدي"),
        customerPhone: normalizedPhone || undefined,
        saleType,
        employeeId: saleType === "employee" ? Number(employeeId) : undefined,
        partnerId: saleType === "partner" ? Number(partnerId) : undefined,
        billingCycle: saleType === "customer" ? undefined : billingCycle,
        discountPercentage: discountPctNum,
        discountAmount: customerAmountDiscount ? Math.round(discountAmount * 100) / 100 : undefined,
        paymentMethod,
        onHold,
        allowIngredientShortage,
        receiptComment: receiptComment.trim() || undefined,
        items: cart.map((l) => ({
          cafeProductId: l.cafeProductId,
          cafeVariantId: l.cafeVariantId,
          itemNote: l.itemNote.trim() || undefined,
          name: l.name,
          productCode: l.productCode,
          quantity: l.quantity,
        })),
      };
      if (!onHold && paymentMethod === "mixed") {
        const cashAmt = Number(mixedCash) || 0;
        const cardAmt = Number(mixedCard) || 0;
        payload.payments = [
          { method: "cash", amount: cashAmt },
          { method: "card", amount: cardAmt },
        ];
      }
      const { data } = draftId
        ? onHold
          ? await api.put(`/quick-sales/${draftId}/draft`, payload)
          : await api.post(`/quick-sales/${draftId}/finalize`, payload)
        : await api.post("/quick-sales", payload);
      if (onHold) {
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setReceiptComment("");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["quick-sales"] }),
          queryClient.invalidateQueries({ queryKey: ["cafe-products"] }),
        ]);
        toast.success(
          ui("تم حفظ الفاتورة في المسودات وحجز مكوناتها من المخزون"),
        );
        navigate("/sales/drafts");
        return;
      }
      const completedReceipt: PosReceiptData = {
        saleNumber: data.saleNumber,
        dailyNumber: data.dailyNumber,
        saleDate: data.saleDate,
        paymentMethod: data.paymentMethod,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        taxAmount: data.taxAmount,
        totalAmount: data.totalAmount,
        receiptComment: data.receiptComment ?? undefined,
        currency,
        businessName: receiptBusinessName,
        logoUrl: receiptLogoUrl,
        footerText: receiptFooter,
        branchName:
          branches?.find((branch) => String(branch.id) === effectiveBranchId)
            ?.name ?? undefined,
        items: data.items.map(
          (i: {
            name: string;
            variantName?: string;
            itemNote?: string | null;
            quantity: number;
            unitPrice: number;
            lineTotal: number;
          }) => ({
            name: i.name,
            variantName: i.variantName,
            itemNote: i.itemNote ?? undefined,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          }),
        ),
      };
      setLastReceipt(completedReceipt);
      setShowPrint(true);
      void dispatchPosPrintJobs(
        completedReceipt,
        printTemplates.filter((template) => template.layoutConfig.documentType === "customer_receipt"),
      ).catch(() =>
        toast.error(
          ui(
            "تم تأكيد الطلب، وتعذر إرسال مهام الطباعة. استخدم أزرار إعادة الطباعة.",
          ),
        ),
      );
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setReceiptComment("");
      // Refresh sales and stock; every sale is attributed directly to the signed-in user.
      void queryClient.invalidateQueries({ queryKey: ["quick-sales"] });
      void queryClient.invalidateQueries({
        queryKey: ["billing-account-sales"],
      });
      void queryClient.invalidateQueries({ queryKey: ["billing-statements"] });
      void queryClient.invalidateQueries({ queryKey: ["cafe-products"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
      toast.success(ui("تم إتمام البيع"));
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const response = e.response?.data as
          | {
              code?: string;
              canContinueWithNegative?: boolean;
              shortages?: StockShortageLine[];
              affectedProducts?: StockShortageProduct[];
            }
          | undefined;
        if (
          response?.code === "CAFE_STOCK_SHORTAGE" &&
          Array.isArray(response.shortages) &&
          response.shortages.length > 0
        ) {
          setStockShortage({
            onHold,
            canContinueWithNegative: response.canContinueWithNegative === true,
            shortages: response.shortages,
            affectedProducts: Array.isArray(response.affectedProducts)
              ? response.affectedProducts
              : [],
          });
          return;
        }
      }
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const continueWithNegativeStock = () => {
    if (!stockShortage?.canContinueWithNegative) return;
    const onHold = stockShortage.onHold;
    setStockShortage(null);
    setResolvingShortage("continue");
    void checkout(onHold, true).finally(() => setResolvingShortage(null));
  };

  const disableUnavailableProducts = async () => {
    if (!stockShortage) return;
    const productIds = [
      ...new Set(
        stockShortage.affectedProducts
          .map((product) => product.cafeProductId)
          .filter((id): id is number => id != null),
      ),
    ];
    if (!productIds.length) {
      toast.error(ui("لا يمكن إيقاف هذا البند من قائمة منتجات الكافيه"));
      return;
    }
    setResolvingShortage("disable");
    try {
      await api.post("/cafe-products/availability/unavailable", { productIds });
      setCart((current) =>
        current.filter((line) => !productIds.includes(line.cafeProductId)),
      );
      setStockShortage(null);
      await queryClient.invalidateQueries({ queryKey: ["cafe-products"] });
      toast.success(
        productIds.length === 1
          ? ui("تم إيقاف المنتج من قائمة البيع وإزالته من السلة")
          : ui(
              "تم إيقاف المنتجات غير المتاحة من قائمة البيع وإزالتها من السلة",
            ),
      );
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setResolvingShortage(null);
    }
  };

  return (
    <GymSalesPageShell
      section="sales"
      title={draftId ? ui("تعديل فاتورة معلقة") : ui("نقطة بيع الكافيه")}
      description={ui(
        "اختيار أسرع للمنتجات، طلب مرتب، وتأكيد فوري متزامن مع المخزون",
      )}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_500px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-2xl border bg-gradient-to-l from-primary/10 via-card to-card p-4 shadow-sm">
            <div className="min-w-[140px] flex-1">
              <Label className="text-xs">{ui("الفرع")}</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={effectiveBranchId}
                onChange={(e) => void changeBranch(e.target.value)}
                disabled={draftId > 0 || (branches?.length ?? 0) <= 1}
              >
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Depends on the branch: lists only that branch's warehouses / bars. */}
            <div className="min-w-[180px] flex-1 [&_label]:text-xs">
              <WarehouseSelect branchId={effectiveBranchId} value={warehouseId} disabled={!!draftId || cart.length > 0} onChange={setWarehouseId} label="مخزون البيع / البار" />
            </div>
            <div className="min-w-[140px] flex-1">
              <Label className="text-xs">{ui("جنس العميل")}</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={gender}
                onChange={(e) => setGender(e.target.value as "male" | "female" | "")}
              >
                <option value="">{ui("اختر الجنس")}</option>
                <option value="male">{ui("رجالي")}</option>
                <option value="female">{ui("حريمي")}</option>
              </select>
            </div>
            <div className="min-w-[200px] flex-[2]">
              <Label className="text-xs">{ui("بحث منتج")}</Label>
              <div className="relative mt-1">
                <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="ps-8"
                  placeholder={ui("اسم أو كود المنتج…")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid items-start gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
            <PosCategoryGrid
              categories={categories ?? []}
              activeCategoryId={categoryId}
              onSelect={(nextCategoryId) => {
                if (nextCategoryId === "all") {
                  toast.error(ui("اختر فئة واحدة للفاتورة"));
                  return;
                }
                if (cart.length && nextCategoryId !== categoryId) {
                  toast.error(ui("أفرغ السلة قبل تغيير فئة الفاتورة"));
                  return;
                }
                setCategoryId(nextCategoryId);
                setRecommendedEmployeeId('');
              }}
            />

            <div className="space-y-4">
              <div className="grid justify-start gap-x-5 gap-y-16 pt-14 [grid-template-columns:repeat(auto-fill,minmax(210px,230px))]">
                {productsLoading ? (
                  <p className="col-span-full text-sm text-muted-foreground">
                    {ui("جاري التحميل…")}
                  </p>
                ) : (
                  (products ?? []).map((p) => {
                    const inCartQuantity = cart
                      .filter((line) => line.cafeProductId === p.id)
                      .reduce((sum, line) => sum + line.quantity, 0);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addToCart(p)}
                        disabled={
                          p.productType === "ready" && (p.currentStock ?? 0) <= 0
                        }
                        className={`group relative flex aspect-square min-h-0 flex-col items-center rounded-3xl border bg-card px-4 pb-4 pt-24 text-center shadow-[0_14px_36px_-26px_rgba(15,82,150,.8)] transition hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-55 ${inCartQuantity > 0 ? "border-primary ring-2 ring-primary/15" : ""}`}
                      >
                        <span className="absolute -top-14 left-1/2 size-36 -translate-x-1/2 rounded-full bg-card p-1.5 shadow-xl ring-1 ring-border transition-transform group-hover:scale-105">
                          <img
                            src={resolveProductImageUrl(p.imageUrl)}
                            alt={p.name}
                            className="size-full rounded-full bg-muted object-cover"
                            loading="eager"
                            decoding="async"
                          />
                        </span>
                        <span className="absolute end-3 top-3 grid size-9 place-items-center rounded-full bg-slate-950 text-white shadow-md transition-transform group-hover:scale-110">
                          <Plus className="size-4" />
                        </span>
                        {inCartQuantity > 0 ? (
                          <span className="absolute start-3 top-3 grid min-w-8 place-items-center rounded-full bg-primary px-2 py-1.5 text-xs font-black text-primary-foreground shadow-md">
                            × {toArabicDigits(inCartQuantity)}
                          </span>
                        ) : null}
                        <p className="mt-1 line-clamp-2 min-h-11 text-base font-black leading-6">
                          {p.name}
                        </p>
                        <p className="nums mt-1 text-xs text-muted-foreground">
                          {p.productCode}
                        </p>
                        <p className="nums mt-2 text-lg font-black text-primary">
                          {p.variantCount > 0 ? (
                            <span className="me-1 text-[9px] font-medium text-muted-foreground">
                              {ui("من")}
                            </span>
                          ) : null}
                          {toArabicDigits(p.sellPrice)}{" "}
                          <span className="text-[10px] font-bold">{currency}</span>
                        </p>
                        <div className="mt-auto flex min-h-5 items-center justify-center pt-1.5">
                          {p.productType === "ready" ? (
                            <span
                              className={`nums rounded-full px-3 py-1 text-xs font-black ${(p.currentStock ?? 0) > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                            >
                              {ui("متبقي")} {toArabicDigits(p.currentStock ?? 0)}
                            </span>
                          ) : p.variantCount > 0 ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">
                              {toArabicDigits(p.variantCount)} {ui("اختيارات")}
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold text-muted-foreground">
                              {ui("جاهز للإضافة")}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              {hasMoreProducts ? (
                <div className="flex justify-center pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loadingMoreProducts}
                    onClick={() => void fetchMoreProducts()}
                  >
                    {loadingMoreProducts
                      ? ui("جاري تحميل المزيد…")
                      : ui("عرض المزيد من المنتجات")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <Card className="h-fit overflow-hidden border shadow-xl xl:sticky xl:top-4">
          <CardHeader className="border-b bg-gradient-to-l from-primary/15 via-primary/5 to-card pb-4">
            <CardTitle className="flex items-center justify-between gap-2 text-lg">
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                {ui("سلة الطلب")}
              </span>
              <span className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!cart.length}
                  onClick={() => setCart([])}
                >
                  <RotateCcw className="size-4" />
                  {ui("تفريغ")}
                </Button>
                <span className="nums rounded-full bg-primary px-2.5 py-1 text-xs text-primary-foreground">
                  {toArabicDigits(
                    cart.reduce((sum, line) => sum + line.quantity, 0),
                  )}
                </span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  [
                    "customer",
                    `${ui("بيع عادي")} · ${toArabicDigits(configuredCustomerDiscount)}%`,
                  ],
                  [
                    "employee",
                    `${ui("موظف")} · ${toArabicDigits(configuredEmployeeDiscount)}%`,
                  ],
                  ["drawing", ui("مسحوبات الإدارة")],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={saleType === value ? "default" : "ghost"}
                  onClick={() => {
                    setSaleType(value);
                    setBillingCycle(
                      value === "employee"
                          ? "daily"
                          : "immediate",
                    );
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>

            {saleType === 'drawing' ? <section className="space-y-3 rounded-xl border p-3">
              <div><Label>{ui('المسحوب له')}</Label><Input value={drawingRecipient} maxLength={200} onChange={(e) => setDrawingRecipient(e.target.value)} /></div>
              <div><Label>{ui('سبب المسحوبات')}</Label><Input value={drawingReason} onChange={(e) => setDrawingReason(e.target.value)} /></div>
              <p className="text-xs text-muted-foreground">{ui('تُخصم الكمية عند التسجيل، دون تسجيل مبيعات أو مديونية على المستفيد.')}</p>
            </section> : null}
            {saleType !== 'drawing' && categories?.find((c) => String(c.id) === categoryId)?.nameAr.includes('بروتين') ? <Combobox value={recommendedEmployeeId} onValueChange={setRecommendedEmployeeId} options={employeeOptions} placeholder={ui('موصى بواسطة (اختياري)')} /> : null}
            {saleType === "customer" ? (
              <section className="rounded-xl border border-primary/15 bg-primary/[0.025] p-3">
                <div className="mb-2"><p className="text-sm font-bold">{ui("بيانات العميل")}</p><p className="text-[10px] text-muted-foreground">{ui("اختيارية ومحفوظة داخل النظام للأرشفة فقط — لا تظهر في أي إيصال مطبوع.")}</p></div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div><Label htmlFor="cafeCustomerName" className="text-[11px]">{ui("اسم العميل")}</Label><Input id="cafeCustomerName" className="mt-1 h-9" value={customerName} maxLength={100} placeholder={ui("اختياري")} onChange={(event) => setCustomerName(event.target.value)} /></div>
                  <div><Label htmlFor="cafeCustomerPhone" className="text-[11px]">{ui("رقم التليفون")}</Label><Input id="cafeCustomerPhone" dir="ltr" inputMode="tel" className="nums mt-1 h-9 text-end" value={customerPhone} maxLength={20} placeholder="01012345678" onChange={(event) => setCustomerPhone(event.target.value)} /></div>
                </div>
              </section>
            ) : null}

            {saleType === "employee" && (
              <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                <Combobox
                  value={employeeId}
                  onValueChange={setEmployeeId}
                  options={employeeOptions}
                  placeholder={ui("اختر الموظف")}
                  searchPlaceholder={ui("ابحث باسم الموظف أو كوده…")}
                  emptyText={ui("لا يوجد موظف مطابق")}
                  aria-label={ui("بحث واختيار الموظف")}
                />
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-background p-1">
                  {(
                    [
                      ["immediate", ui("دفع الآن")],
                      ["daily", ui("تجميع يومي")],
                      ["monthly", ui("تجميع شهري")],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={billingCycle === value ? "default" : "ghost"}
                      onClick={() => setBillingCycle(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {billingCycle !== "immediate" ? (
                  <p className="text-xs text-muted-foreground">
                    {ui(
                      "لن يُحصّل مبلغ الآن، وستظهر الفاتورة في كشف الموظف للتسوية أو الخصم من الراتب.",
                    )}
                  </p>
                ) : null}
              </div>
            )}
            {saleType === "partner" && (
              <div className="grid gap-2 rounded-xl border bg-muted/20 p-3">
                <Combobox
                  value={partnerId}
                  onValueChange={setPartnerId}
                  options={partnerOptions}
                  placeholder={ui("اختر الشريك")}
                  searchPlaceholder={ui(
                    "ابحث باسم الشريك أو الكود أو رقم الهاتف…",
                  )}
                  emptyText={ui("لا يوجد شريك مطابق")}
                  aria-label={ui("بحث واختيار الشريك")}
                />
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {ui(
                    "تُجمع مسحوبات الشريك في كشف مستقل، ويمكن تسويتها من نسبة الأرباح أو بإيصال دفع منفصل.",
                  )}
                </p>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={billingCycle === "daily" ? "default" : "ghost"}
                    onClick={() => setBillingCycle("daily")}
                  >
                    {ui("تجميع يومي")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={billingCycle === "monthly" ? "default" : "ghost"}
                    onClick={() => setBillingCycle("monthly")}
                  >
                    {ui("تجميع شهري")}
                  </Button>
                </div>
              </div>
            )}

            <section className="overflow-hidden rounded-2xl border-2 border-primary/20 bg-primary/[0.025] shadow-inner">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-primary/15 bg-gradient-to-l from-primary/10 via-primary/[0.04] to-transparent px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <ShoppingCart className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{ui("منتجات الطلب")}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {cart.length
                        ? `${toArabicDigits(cart.length)} ${ui("منتج مضاف")}`
                        : ui("تظهر المنتجات المختارة هنا")}
                    </p>
                  </div>
                </div>
                {cart.length > 1 ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-background/85 px-2.5 py-1 text-[10px] font-semibold text-primary shadow-sm">
                    <ChevronsUpDown className="size-3.5 animate-pulse" />
                    {ui("اسحب لأعلى وأسفل")}
                  </span>
                ) : null}
              </div>

              <div className="relative">
                <div
                  className={`max-h-[360px] space-y-2.5 overflow-y-auto overscroll-contain p-2.5 [scrollbar-gutter:stable] touch-pan-y ${cart.length > 2 ? "pb-12" : ""}`}
                  aria-label={ui("منتجات سلة الطلب القابلة للتمرير")}
                  tabIndex={cart.length > 1 ? 0 : -1}
                >
                  {!cart.length ? (
                    <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed bg-background/60 p-5 text-center">
                      <div>
                        <ShoppingCart className="mx-auto size-9 text-muted-foreground/50" />
                        <p className="mt-2 font-semibold">
                          {ui("السلة فارغة")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ui("اختر منتجًا من القائمة ليظهر هنا بوضوح")}
                        </p>
                      </div>
                    </div>
                  ) : (
                    cart.map((l) => {
                      const lineKey = cartLineKey(l);
                      const lineTotal = l.unitPrice * l.quantity;
                      return (
                        <article
                          key={lineKey}
                          className={`rounded-2xl border bg-background p-2.5 shadow-sm transition-all duration-300 ${highlightedLineKey === lineKey ? "border-primary bg-primary/[0.04] ring-2 ring-primary/20 shadow-lg" : ""}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <img
                              src={resolveProductImageUrl(l.imageUrl)}
                              alt={l.name}
                              className="size-16 shrink-0 rounded-xl border bg-muted object-cover shadow-sm"
                              loading="eager"
                              decoding="async"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-base font-bold">
                                    {l.name}
                                  </p>
                                  <p className="nums mt-0.5 text-[11px] text-muted-foreground">
                                    {l.productCode}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="-me-1 -mt-1 size-8 shrink-0 text-destructive"
                                  aria-label={`${ui("حذف")} ${l.name}`}
                                  onClick={() =>
                                    setCart((current) =>
                                      current.filter(
                                        (row) => cartLineKey(row) !== lineKey,
                                      ),
                                    )
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                              {l.variantName ? (
                                <p className="mt-1 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                                  {l.variantName}
                                </p>
                              ) : null}
                              <label className="relative mt-2 block">
                                <MessageSquareText className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-primary" />
                                <Input
                                  className="h-8 rounded-lg bg-muted/35 ps-7 text-xs"
                                  value={l.itemNote}
                                  maxLength={300}
                                  placeholder={ui("ملاحظة للصنف: بدون سكر، ثلج إضافي…")}
                                  aria-label={`${ui("ملاحظة الصنف")} ${l.name}`}
                                  onChange={(event) => {
                                    const itemNote = event.target.value;
                                    setCart((current) =>
                                      current.map((row) =>
                                        cartLineKey(row) === lineKey
                                          ? { ...row, itemNote }
                                          : row,
                                      ),
                                    );
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 items-stretch gap-2 rounded-xl bg-muted/50 p-2 sm:grid-cols-[auto_minmax(110px,1fr)_auto]">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground">
                                {ui("الكمية")}
                              </span>
                              <div className="flex items-center rounded-lg border bg-background p-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={ui("تقليل الكمية")}
                                  onClick={() => updateQty(lineKey, -1)}
                                >
                                  <Minus className="size-3.5" />
                                </Button>
                                <span className="nums min-w-9 text-center text-lg font-black">
                                  {toArabicDigits(l.quantity)}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={ui("زيادة الكمية")}
                                  onClick={() => updateQty(lineKey, 1)}
                                >
                                  <Plus className="size-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div
                              className="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-background px-2.5 py-1.5"
                              title={ui(
                                "سعر البيع محدد من قائمة الأسعار ولا يمكن تغييره من السلة",
                              )}
                            >
                              <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                                <LockKeyhole className="size-3.5 shrink-0 text-primary" />
                                {ui("سعر الوحدة")}
                              </span>
                              <span className="nums shrink-0 font-black text-primary">
                                {toArabicDigits(l.unitPrice.toFixed(2))}{" "}
                                <small className="text-[9px] font-medium text-muted-foreground">
                                  {currency}
                                </small>
                              </span>
                            </div>
                            <div className="col-span-2 flex items-center justify-between rounded-lg border border-primary/15 bg-primary/[0.05] px-2.5 py-1.5 text-end sm:col-span-1 sm:block sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                              <p className="text-[10px] text-muted-foreground">
                                {ui("إجمالي الصنف")}
                              </p>
                              <p className="nums text-lg font-black text-primary">
                                {toArabicDigits(lineTotal.toFixed(2))}{" "}
                                <span className="text-[10px] font-medium">
                                  {currency}
                                </span>
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
                {cart.length > 2 ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t from-card via-card/90 to-transparent pb-2">
                    <span className="flex items-center gap-1 rounded-full bg-foreground/85 px-3 py-1 text-[10px] font-bold text-background shadow-lg">
                      <ChevronsUpDown className="size-3.5 animate-bounce" />
                      {ui("اسحب لعرض باقي المنتجات")}
                    </span>
                  </div>
                ) : null}
              </div>
            </section>

            {!deferredBilling && (
              <section className="rounded-2xl border bg-muted/20 p-3">
                <div className="grid grid-cols-[1fr_82px_1fr] items-end gap-2">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <Label className="text-[11px]">
                        {saleType === "employee"
                          ? ui("خصم الموظف %")
                          : saleType === "customer"
                            ? ui("خصم العميل")
                            : ui("خصم العميل %")}
                      </Label>
                      {saleType === "customer" && (
                        <div className="flex overflow-hidden rounded-md border text-[11px]" role="group" aria-label={ui("نوع الخصم")}>
                          {(["amount", "percent"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              aria-pressed={discountMode === mode}
                              className={`px-2 py-0.5 ${discountMode === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                              onClick={() => setDiscountMode(mode)}
                            >
                              {mode === "amount" ? ui("مبلغ") : "%"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Input
                      className="nums mt-1 h-9"
                      type="number"
                      min={0}
                      max={customerAmountDiscount ? undefined : 100}
                      step="0.01"
                      value={
                        saleType === "employee"
                          ? String(configuredEmployeeDiscount)
                          : customerAmountDiscount
                            ? discountValue
                            : discountPct
                      }
                      readOnly={saleType === "employee"}
                      disabled={saleType === "employee"}
                      onChange={(event) =>
                        customerAmountDiscount
                          ? setDiscountValue(event.target.value)
                          : setDiscountPct(event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">{ui("الضريبة")}</Label>
                    <div className="nums mt-1 grid h-9 place-items-center rounded-md border bg-background text-sm font-bold text-muted-foreground">
                      {toArabicDigits(effectiveTaxPct)}%
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px]">{ui("طريقة الدفع")}</Label>
                    <select
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                    >
                      {paymentOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {!paymentOptions.length ? (
                  <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {ui(
                      "لا توجد طريقة دفع مفعّلة. فعّل طريقة واحدة على الأقل من إعدادات نقطة البيع.",
                    )}
                  </p>
                ) : null}
              </section>
            )}

            {!deferredBilling && paymentMethod === "mixed" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{ui("نقدي")}</Label>
                  <Input
                    className="nums mt-1"
                    type="number"
                    min={0}
                    max={total}
                    step="0.01"
                    value={mixedCash}
                    onChange={(e) => {
                      const value = Math.min(
                        total,
                        Math.max(0, Number(e.target.value) || 0),
                      );
                      setMixedCash(String(value));
                      setMixedCard(
                        String(Math.round((total - value) * 100) / 100),
                      );
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">{ui("بطاقة")}</Label>
                  <Input
                    className="nums mt-1"
                    type="number"
                    min={0}
                    max={total}
                    step="0.01"
                    value={mixedCard}
                    onChange={(e) => {
                      const value = Math.min(
                        total,
                        Math.max(0, Number(e.target.value) || 0),
                      );
                      setMixedCard(String(value));
                      setMixedCash(
                        String(Math.round((total - value) * 100) / 100),
                      );
                    }}
                  />
                </div>
                <p
                  className={`col-span-2 rounded-md px-3 py-2 text-xs ${mixedPaymentValid ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                >
                  {mixedPaymentValid
                    ? ui("تم توزيع إجمالي الفاتورة بالكامل")
                    : `${ui("المتبقي")}: ${toArabicDigits(mixedRemaining.toFixed(2))} ${currency}`}
                </p>
              </div>
            )}

            <div className="rounded-xl border">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start"
                onClick={() => setCommentOpen((open) => !open)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MessageSquareText className="size-4 shrink-0 text-primary" />
                  <span className="text-sm font-semibold">
                    {ui("تعليق الإيصال")}
                  </span>
                  {receiptComment ? (
                    <span className="truncate text-xs text-muted-foreground">
                      — {receiptComment}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {ui("اختياري")}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${commentOpen ? "rotate-180" : ""}`}
                />
              </button>
              {commentOpen ? (
                <div className="border-t p-3">
                  <Textarea
                    autoFocus
                    className="min-h-16 resize-none"
                    value={receiptComment}
                    onChange={(event) => setReceiptComment(event.target.value)}
                    placeholder={ui("مثال: بدون سكر، ثلج إضافي، عميل VIP…")}
                    maxLength={1000}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {ui("يظهر في المسودة وعلى الإيصال المطبوع")}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border bg-gradient-to-l from-primary/[0.07] to-transparent p-3">
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[10px] text-muted-foreground">
                    {ui("المجموع")}
                  </dt>
                  <dd className="nums mt-0.5 font-bold">
                    {toArabicDigits(subtotal.toFixed(2))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted-foreground">
                    {ui("الخصم")}
                  </dt>
                  <dd className="nums mt-0.5 font-bold text-rose-600">
                    -{toArabicDigits(discountAmount.toFixed(2))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-muted-foreground">
                    {ui("الضريبة")}
                  </dt>
                  <dd className="nums mt-0.5 font-bold">
                    {toArabicDigits(taxAmount.toFixed(2))}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-sm">
                <span className="text-sm font-bold">
                  {saleType === 'drawing' ? ui('قيمة البيع المرجعية — لا تُحصّل') : saleType === "partner"
                    ? ui("قيمة الاستهلاك المرجعية")
                    : ui("الإجمالي")}
                </span>
                <span className="nums text-2xl font-black">
                  {toArabicDigits(total.toFixed(2))}{" "}
                  <span className="text-xs font-medium opacity-80">
                    {currency}
                  </span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-14 border-amber-300 bg-amber-50 text-sm font-bold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-200"
                disabled={!cart.length || saving || saleType === 'drawing'}
                onClick={() => void checkout(true)}
              >
                <PauseCircle className="me-2 size-5" />
                {ui("تعليق وحفظ")}
              </Button>
              <Button
                className="h-14 text-sm font-bold shadow-lg shadow-primary/20"
                disabled={
                  !cart.length ||
                  saving ||
                  (!deferredBilling &&
                    (!mixedPaymentValid || !paymentOptions.length))
                }
                onClick={() => void checkout(false)}
              >
                <PackageCheck className="me-2 size-5" />{" "}
                {saleType === 'drawing' ? ui('تسجيل المسحوبات') : deferredBilling
                  ? billingCycle === "daily"
                    ? ui("إضافة للحساب اليومي")
                    : ui("إضافة للحساب الشهري")
                  : ui("تأكيد الطلب")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={!!variantProduct}
        onOpenChange={(open) => {
          if (!open) setVariantProduct(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui("اختر الحجم أو النوع")}</DialogTitle>
          </DialogHeader>
          {variantProduct ? (
            <div className="flex items-center gap-4 rounded-2xl border bg-primary/[0.04] p-4">
              <img
                src={resolveProductImageUrl(variantProduct.imageUrl)}
                alt={variantProduct.name}
                className="size-28 shrink-0 rounded-2xl border bg-muted object-cover shadow-md"
              />
              <div className="min-w-0">
                <p className="truncate text-xl font-black">
                  {variantProduct.name}
                </p>
                <p className="nums mt-1 text-xs text-muted-foreground">
                  {variantProduct.productCode}
                </p>
                <p className="mt-3 text-sm font-semibold text-primary">
                  {toArabicDigits(variantProduct.variantCount)}{" "}
                  {ui("أحجام أو أنواع متاحة")}
                </p>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {(variantProduct?.variants ?? [])
              .filter((variant) => variant.isActive)
              .map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  autoFocus={variant.isDefault}
                  onClick={() => {
                    if (!variantProduct) return;
                    addResolvedToCart(variantProduct, variant);
                    setVariantProduct(null);
                  }}
                  className={`min-h-28 rounded-2xl border p-5 text-start transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md ${variant.isDefault ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "bg-card"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{variant.name}</span>
                    {variant.isDefault ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                        {ui("الأكثر طلبًا")}
                      </span>
                    ) : null}
                  </span>
                  <span className="nums mt-3 block text-xl font-black text-primary">
                    {toArabicDigits(variant.sellPrice.toFixed(2))}{" "}
                    <span className="text-xs font-medium">{currency}</span>
                  </span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!stockShortage}
        onOpenChange={(open) => {
          if (!open && !resolvingShortage) setStockShortage(null);
        }}
      >
        <DialogContent size="lg" className="overflow-hidden p-0">
          <DialogHeader className="border-b bg-gradient-to-l from-amber-100/90 via-amber-50 to-card p-6 pe-14 dark:from-amber-950/35 dark:via-amber-950/10">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                <TriangleAlert className="size-6" />
              </span>
              <div>
                <DialogTitle>{ui("خامات غير متوفرة لتحضير الطلب")}</DialogTitle>
                <DialogDescription className="mt-1">
                  {ui(
                    "اختر استكمال الطلب وتسجيل العجز في المخزون، أو أوقف المنتج من قائمة البيع حتى تتوفر خاماته.",
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {stockShortage ? (
            <div className="space-y-4 px-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  {ui("المنتجات المتأثرة")}:
                </span>
                {stockShortage.affectedProducts.map((product, index) => (
                  <span
                    key={`${product.cafeProductId ?? "item"}-${product.variantName ?? "base"}-${index}`}
                    className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/25 dark:text-amber-100"
                  >
                    {product.name}
                    {product.variantName ? ` · ${product.variantName}` : ""}
                  </span>
                ))}
              </div>

              <div className="max-h-[340px] space-y-3 overflow-y-auto pe-1">
                {stockShortage.shortages.map((shortage) => (
                  <article
                    key={shortage.ingredientId}
                    className="rounded-2xl border-2 border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900/50 dark:bg-rose-950/15"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <PackageX className="size-5 shrink-0 text-rose-600" />
                        <p className="truncate font-black">
                          {shortage.ingredientName}
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white">
                        {ui("ناقص")} {toArabicDigits(shortage.shortage)}{" "}
                        {ui(cafeUnitLabel(shortage.unit))}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border bg-background px-2 py-2">
                        <dt className="text-[10px] text-muted-foreground">
                          {ui("الموجود")}
                        </dt>
                        <dd className="nums mt-1 font-black text-rose-600">
                          {toArabicDigits(shortage.available)}
                        </dd>
                      </div>
                      <div className="rounded-xl border bg-background px-2 py-2">
                        <dt className="text-[10px] text-muted-foreground">
                          {ui("المطلوب")}
                        </dt>
                        <dd className="nums mt-1 font-black">
                          {toArabicDigits(shortage.required)}
                        </dd>
                      </div>
                      <div className="rounded-xl border bg-background px-2 py-2">
                        <dt className="text-[10px] text-muted-foreground">
                          {ui("الوحدة")}
                        </dt>
                        <dd className="mt-1 text-xs font-black">
                          {ui(cafeUnitLabel(shortage.unit))}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>

              {stockShortage.canContinueWithNegative ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-100">
                  <b>{ui("عند الاستكمال")}:</b>{" "}
                  {ui(
                    "سيتم تسجيل صرف الخامات بالكامل، ويظهر الرصيد بالسالب مع الاحتفاظ بحركة مخزنية واضحة حتى تتم إضافة المشتريات.",
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-100">
                  {ui(
                    "هذا النقص يخص منتجًا جاهزًا، لذلك لا يمكن تسجيله بالسالب. عدّل الكمية أو أزل البند من السلة.",
                  )}
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="grid gap-2 border-t bg-muted/20 p-5 sm:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              disabled={!!resolvingShortage}
              onClick={() => setStockShortage(null)}
            >
              {ui("الرجوع للسلة")}
            </Button>
            {stockShortage?.canContinueWithNegative ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!!resolvingShortage}
                  onClick={() => void disableUnavailableProducts()}
                >
                  {resolvingShortage === "disable" ? (
                    <Loader2 className="me-2 size-4 animate-spin" />
                  ) : (
                    <PackageX className="me-2 size-4" />
                  )}
                  {ui("إيقاف المنتج من المنيو")}
                </Button>
                <Button
                  type="button"
                  disabled={!!resolvingShortage}
                  onClick={continueWithNegativeStock}
                >
                  {resolvingShortage === "continue" ? (
                    <Loader2 className="me-2 size-4 animate-spin" />
                  ) : (
                    <PackageCheck className="me-2 size-4" />
                  )}
                  {ui("استكمال وتسجيل العجز")}
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PosReceiptPrint
        open={showPrint}
        onOpenChange={setShowPrint}
        receipt={lastReceipt}
        templates={printTemplates}
        confirmationOnly
        onDone={() => setLastReceipt(null)}
      />
    </GymSalesPageShell>
  );
}
