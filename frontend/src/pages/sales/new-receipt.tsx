import { receiptLogoUrl as resolveReceiptLogoUrl } from '@/lib/receipt-brand';
import { PosPaymentDialog } from '@/components/sales/pos-payment-dialog';
import {
  Banknote,
  Calculator,
  ChevronDown,
  ChevronsUpDown,
  CreditCard,
  FileClock,
  Loader2,
  LockKeyhole,
  Landmark,
  MessageSquareText,
  Minus,
  PackageCheck,
  PackageX,
  PauseCircle,
  Plus,
  RotateCcw,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  PosReceiptPrint,
  type PosReceiptData,
} from "@/components/sales/pos-receipt-print";
import { PosShiftSwitcher } from "@/components/sales/pos-shift-switcher";
import {
  PosCalculatorDialog,
} from "@/components/sales/pos-cash-tools";
import { PosOrderReviewDialog } from "@/components/sales/pos-order-review-dialog";
import {
  newPaymentAllocation,
  PosMixedPaymentPanel,
  type PosPaymentAllocation,
  type PosPaymentCatalogOption,
} from "@/components/sales/pos-mixed-payment-panel";
import { PosCategoryGrid } from "@/components/cafe/pos-category-grid";
import { CameraBarcodeScanner } from "@/components/club/camera-barcode-scanner";
import { usePosCartViewport } from "@/components/cafe/use-pos-cart-viewport";
import { PosProductBrowserFrame } from "@/components/cafe/pos-product-browser-frame";
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
import { usePermission } from "@/hooks/use-permission";
import { api, apiError } from "@/lib/api";
import { applyProductImageFallback, resolveProductImageUrl } from "@/lib/product-image";
import { toArabicDigits } from "@/lib/utils";
import { cafeUnitLabel } from "@/lib/cafe-units";
import { filterConfiguredPaymentMethods, paymentRemainingCents } from "@/lib/pos-payment-allocation";
import { employeeCartBenefits, type EmployeeBenefits } from '@/lib/employee-benefits';
import { TouchKeypadContext } from '@/components/ui/touch-keypad-context';
import { savedPosReceipt } from '@/lib/saved-pos-receipt';
import { completedInvoicePaymentChanges, completedInvoiceTaxRate, reservedProductQuantity } from '@/lib/completed-invoice-edit';
import type { QuickSaleRow } from '@/types/gym-sales';
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

interface CafeMemberLookup {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  cardNumber: string | null;
  isActive: boolean;
}

const clampPercentage = (value: number) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

export function SalesNewReceiptPage() {
  const cartViewportRef = usePosCartViewport();
  const { ui } = useLocale();
  const { can } = usePermission();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftId = Number(searchParams.get("draftId") || 0);
  const editId = Number(searchParams.get("editId") || 0);
  const completedEdit = editId > 0;
  const canPrint = can("gym-sales.sales.new_receipt:print") || (completedEdit && can("gym-sales.sales.drafts:print"));
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const { data: branches } = useBranches();
  const { data: employeeOptions = [] } = usePosEmployeeOptions();
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [saleType, setSaleType] = useState<"customer" | "employee" | "partner">(
    "customer",
  );
  const [employeeId, setEmployeeId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [billingCycle, setBillingCycle] = useState<
    "immediate" | "daily" | "monthly"
  >("immediate");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [memberCode, setMemberCode] = useState("");
  const [linkedMember, setLinkedMember] = useState<CafeMemberLookup | null>(null);
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [memberScannerOpen, setMemberScannerOpen] = useState(false);
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const consumedMemberScan = useRef<string | null>(null);
  const [debouncedMemberCode, setDebouncedMemberCode] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [splitPayment, setSplitPayment] = useState(false);
  const [paymentAllocations, setPaymentAllocations] = useState<PosPaymentAllocation[]>([]);
  const [receiptComment, setReceiptComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [orderReviewOpen, setOrderReviewOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  useEffect(() => { if (!cart.length) setCashTendered(''); }, [cart.length]);
  const [highlightedLineKey, setHighlightedLineKey] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<PosReceiptData | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [editInvoice, setEditInvoice] = useState<QuickSaleRow | null>(null);
  const [editConflict, setEditConflict] = useState(false);
  const [editFinished, setEditFinished] = useState(false);
  useEffect(() => {
    setDraftLoaded(false);
    setEditInvoice(null);
    setEditConflict(false);
    setEditFinished(false);
  }, [editId, draftId]);
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
    queryKey: ["cafe-products", "pos", search, categoryId, effectiveBranchId],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data: r } = await api.get<PaginatedResponse<CafeProductListItem>>(
        "/cafe-products",
        {
          params: {
            page: pageParam,
            pageSize: 100,
            search: search || undefined,
            categoryId: categoryId === "all" ? undefined : categoryId,
            branchId: effectiveBranchId || undefined,
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
    () =>
      (productPages?.pages ?? [])
        .flatMap((page) => page.data)
        .filter(
          (product) => product.isActive && product.productType !== "internal",
        ),
    [productPages],
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

  const normalizedCustomerPhone = customerPhone.trim().replace(/[\s\-()]/g, "");
  const validCustomerPhone = /^(?:01\d{9}|\+?[1-9]\d{6,14})$/.test(
    normalizedCustomerPhone,
  );
  const { data: customerLookup, isFetching: customerLookupLoading } = useQuery({
    queryKey: ["cafe-customer-lookup", effectiveBranchId, normalizedCustomerPhone],
    queryFn: async () =>
      (
        await api.get<{ found: boolean; name: string | null; phone: string }>(
          "/quick-sales/customers/lookup",
          {
            params: {
              branchId: effectiveBranchId,
              phone: normalizedCustomerPhone,
            },
          },
        )
      ).data,
    enabled: saleType === "customer" && Boolean(effectiveBranchId) && validCustomerPhone,
  });

  useEffect(() => {
    if (!linkedMember && customerLookup?.found && customerLookup.name) {
      setCustomerName(customerLookup.name);
    }
  }, [customerLookup, linkedMember]);

  useEffect(() => {
    const query = memberCode.trim();
    if (linkedMember || query.length < 2) {
      setDebouncedMemberCode("");
      return;
    }
    const timeout = window.setTimeout(() => setDebouncedMemberCode(query), 250);
    return () => window.clearTimeout(timeout);
  }, [linkedMember, memberCode]);

  const { data: memberSearch, isFetching: memberSearchLoading } = useQuery({
    queryKey: ["cafe-member-search", effectiveBranchId, debouncedMemberCode],
    queryFn: async () =>
      (
        await api.get<{ results: CafeMemberLookup[] }>(
          "/quick-sales/customers/member-search",
          {
            params: {
              branchId: effectiveBranchId,
              query: debouncedMemberCode,
            },
          },
        )
      ).data,
    enabled:
      saleType === "customer" &&
      Boolean(effectiveBranchId) &&
      debouncedMemberCode.length >= 2,
  });
  const memberSuggestions = memberSearch?.results ?? [];

  const selectGymMember = (member: CafeMemberLookup) => {
    setLinkedMember(member);
    setMemberCode(member.memberCode);
    setCustomerName(member.name);
    setCustomerPhone(member.phone ?? "");
    setMemberSearchOpen(false);
    setMemberScannerOpen(false);
    toast.success(ui("تم تحميل بيانات العضو من الجيم"));
  };

  const lookupGymMember = async (rawCode: string) => {
    const code = rawCode.trim();
    setMemberCode(code);
    if (!code) {
      toast.error(ui("اكتب كود العضو أو امسحه بالسكانر"));
      return;
    }
    if (!effectiveBranchId) {
      toast.error(ui("اختر فرع الكافيه أولًا"));
      return;
    }

    setMemberLookupLoading(true);
    try {
      const { data } = await api.get<{
        found: boolean;
        member: CafeMemberLookup | null;
      }>("/quick-sales/customers/member-lookup", {
        params: { branchId: effectiveBranchId, code },
      });
      if (!data.found || !data.member) {
        setLinkedMember(null);
        setMemberSearchOpen(true);
        toast.error(ui("كود العضو غير مسجل في هذا الفرع — يمكنك إدخال الاسم والموبايل يدويًا"));
        return;
      }
      selectGymMember(data.member);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setMemberLookupLoading(false);
    }
  };

  useEffect(() => {
    const scanned = searchParams.get('memberScan')?.trim();
    if (!scanned) {
      consumedMemberScan.current = null;
      return;
    }
    if (!effectiveBranchId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('memberScan');
    setSearchParams(next, { replace: true });
    if (consumedMemberScan.current === scanned) return;
    consumedMemberScan.current = scanned;
    void lookupGymMember(scanned);
  }, [effectiveBranchId, searchParams, setSearchParams]);

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

  const paymentCatalogQuery = useQuery({
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
          requiresReference: boolean;
        }>
      >("/pos-payment-methods", { params: { pageSize: 100 } });
      return (r.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        method: p.baseMethod,
        supportsMixedPayment: p.supportsMixedPayment,
        requiresReference: p.requiresReference,
        isEnabled: p.isEnabled,
      })) as PosPaymentCatalogOption[];
    },
  });

  const paymentCatalog = paymentCatalogQuery.data;
  const invoiceQuery = useQuery({
    queryKey: ["quick-sales", completedEdit ? 'completed-edit' : "draft", editId || draftId],
    queryFn: async () => (await api.get<QuickSaleRow>(`/quick-sales/${editId || draftId}`)).data,
    enabled: completedEdit ? can('gym-sales.sales.drafts:update') : draftId > 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: 'always',
    staleTime: Infinity,
  });
  const draft = invoiceQuery.data;
  const originalProductsQuery = useQuery({
    queryKey: ['cafe-products', 'invoice-edit', editId || draftId, draft?.branchId, draft?.editRevision],
    queryFn: async () => Promise.all((draft?.items ?? []).map(async item => {
      const { data } = await api.get<PaginatedResponse<CafeProductListItem>>('/cafe-products', {
        params: { branchId: draft!.branchId, search: item.productCode || item.name, page: 1, pageSize: 100 },
      });
      const product = data.data.find(product => product.id === item.cafeProductId);
      if (!product) throw new Error(ui('تعذر تحميل أحد منتجات الفاتورة ومخزونه'));
      return product;
    })),
    enabled: !!draft && (completedEdit || draftId > 0),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: 'always',
    staleTime: Infinity,
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
  const employeeDiscountEnabled = posSettings?.find((setting) => setting.key === 'employee_discount_enabled')?.value !== false;
  const employeeBenefitsQuery = useQuery({
    queryKey: ['quick-sales', 'employee-benefits', employeeId, effectiveBranchId, draftId, editId],
    queryFn: async () => (await api.get<EmployeeBenefits>(`/quick-sales/employees/${employeeId}/benefits`, { params: { branchId: effectiveBranchId, draftId: draftId || undefined, editId: editId || undefined } })).data,
    enabled: saleType === 'employee' && !!employeeId && !!effectiveBranchId,
    refetchInterval: 30_000,
  });
  const configuredPartnerDiscount = clampPercentage(
    Number(
      posSettings?.find(
        (setting) => setting.key === "partner_discount_percentage",
      )?.value ?? 0,
    ),
  );

  useEffect(() => {
    if (!posSettings || draftId || editId) return;
    setDiscountPct(
      String(
        saleType === "employee"
          ? employeeDiscountEnabled ? configuredEmployeeDiscount : 0
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
    employeeDiscountEnabled,
    configuredPartnerDiscount,
    draftId,
    editId,
    posSettings,
    saleType,
  ]);

  useEffect(() => {
    if (!draft || draftLoaded || invoiceQuery.isFetching || originalProductsQuery.isFetching || (completedEdit ? draft.status !== 'completed' : draft.status !== 'draft')) return;
    if (!originalProductsQuery.isSuccess || !paymentCatalog) return;
    if (effectiveBranchId !== String(draft.branchId)) {
      setBranchId(String(draft.branchId));
      return;
    }
    setCustomerName(draft.customerName === ui("عميل نقدي") ? "" : (draft.customerName ?? ""));
    setCustomerPhone(draft.customerPhone ?? "");
    setMemberCode("");
    setLinkedMember(null);
    setMemberSearchOpen(false);
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
    setPaymentMethod(draft.paymentMethod ?? "cash");
    const payments = draft.payments ?? [];
    const methodId = (payment: NonNullable<QuickSaleRow['payments']>[number]) => payment.catalogPaymentMethodId
      ?? paymentCatalog.find(method => method.method === payment.method)?.id
      ?? ({ cash: -1, card: -2, wallet: -3, transfer: -4 }[payment.method] ?? -1);
    setSplitPayment(payments.length > 1);
    setPaymentAllocations(payments.map(payment => ({ ...newPaymentAllocation(methodId(payment)), amount: Number(payment.amount).toFixed(2), reference: payment.reference ?? '' })));
    if (payments[0]) {
      setSelectedPaymentMethodId(String(methodId(payments[0])));
      setPaymentReference(payments[0].reference ?? '');
      if (payments.length === 1) setPaymentMethod(payments[0].method);
    }
    setReceiptComment(draft.receiptComment ?? "");
    setCommentOpen(!!draft.receiptComment);
    setCart(
      (draft.items ?? []).map(item => {
          const product = originalProductsQuery.data.find(row => row?.id === item.cafeProductId);
          return {
            cafeProductId: item.cafeProductId ?? 0,
            cafeVariantId: item.cafeVariantId ?? undefined,
            variantName: item.variantName ?? undefined,
            itemNote: item.itemNote ?? "",
            name: item.name,
            productCode: item.productCode ?? '',
            unitPrice: Number(item.unitPrice),
            quantity: Number(item.quantity),
            imageUrl: product?.imageUrl ?? null,
            productType: product?.productType ?? "prepared",
            currentStock: product?.currentStock != null ? product.currentStock + (completedEdit && draft.inventoryPosted ? reservedProductQuantity(draft.items ?? [], product.id) : 0) : null,
          };
        },
      ),
    );
    if (completedEdit) setEditInvoice(draft);
    setDraftLoaded(true);
  }, [draft, draftLoaded, ui, effectiveBranchId, completedEdit, invoiceQuery.isFetching, originalProductsQuery.isFetching, originalProductsQuery.isSuccess, originalProductsQuery.data, paymentCatalog]);

  useEffect(() => {
    if (!highlightedLineKey) return;
    const timeout = window.setTimeout(() => setHighlightedLineKey(null), 900);
    return () => window.clearTimeout(timeout);
  }, [highlightedLineKey]);

  const availablePaymentMethods = useMemo<PosPaymentCatalogOption[]>(() => {
    const allCatalog = paymentCatalog ?? [];
    const savedPayments = (completedEdit ? draft?.payments : undefined) ?? [];
    const catalog = filterConfiguredPaymentMethods(allCatalog, savedPayments);
    const fallbackIds: Record<string, number> = { cash: -1, card: -2, wallet: -3, transfer: -4 };
    for (const payment of savedPayments) {
      const id = payment.catalogPaymentMethodId ?? catalog.find(method => method.method === payment.method)?.id ?? fallbackIds[payment.method];
      if (id != null && !catalog.some(method => method.id === id)) catalog.push({
        id, method: payment.method as PosPaymentCatalogOption['method'], name: payment.methodName || ui(payment.method === 'cash' ? 'نقدي' : payment.method === 'card' ? 'بطاقة' : payment.method === 'wallet' ? 'محفظة' : 'تحويل'),
        code: payment.methodCode || payment.method, supportsMixedPayment: true, requiresReference: false, isEnabled: true,
      });
    }
    return catalog;
  }, [paymentCatalog, ui, completedEdit, draft?.payments]);

  const allowMixed = availablePaymentMethods.filter((method) => method.supportsMixedPayment).length >= 2;

  useEffect(() => {
    const selected = availablePaymentMethods.find(
      (option) => String(option.id) === selectedPaymentMethodId,
    );
    if (selected) {
      if (paymentMethod !== selected.method) setPaymentMethod(selected.method);
      return;
    }
    const fallback = availablePaymentMethods.find((option) => option.method === paymentMethod)
      ?? availablePaymentMethods[0];
    if (fallback) {
      setSelectedPaymentMethodId(String(fallback.id));
      setPaymentMethod(fallback.method);
    }
  }, [availablePaymentMethods, paymentMethod, selectedPaymentMethodId]);

  const discountPctNum = !completedEdit && saleType === 'employee' && !employeeDiscountEnabled ? 0 : clampPercentage(Number(discountPct));
  const effectiveTaxPct = completedEdit && editInvoice ? completedInvoiceTaxRate(editInvoice) : taxPctNum;

  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [cart],
  );
  const freeDrinks = employeeCartBenefits(cart, saleType === 'employee' ? employeeBenefitsQuery.data : undefined);
  const discountAmount = Math.round((freeDrinks.amount + (subtotal - freeDrinks.amount) * discountPctNum / 100) * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round(afterDiscount * effectiveTaxPct) / 100;
  const total = Math.round((afterDiscount + taxAmount) * 100) / 100;
  const currency = String(
    posSettings?.find((setting) => setting.key === "currency")?.value ?? "EGP",
  );
  const receiptBusinessName = String(
    posSettings?.find((setting) => setting.key === "receipt_business_name")
      ?.value ?? "NOAMANY · CAFE",
  );
  const receiptLogoUrl = resolveReceiptLogoUrl(String(
    posSettings?.find((setting) => setting.key === "receipt_logo_url")?.value ??
      "/noamany-logo.png",
  ));
  const receiptFooter = String(
    posSettings?.find((setting) => setting.key === "receipt_footer")?.value ??
      ui("شكراً لزيارتكم"),
  );
  const selectedPaymentMethod = availablePaymentMethods.find(
    (option) => String(option.id) === selectedPaymentMethodId,
  );
  const mixedRemainingCents = paymentRemainingCents(total, paymentAllocations);
  const mixedPaymentValid =
    !splitPayment || (
      paymentAllocations.length >= 2 &&
      mixedRemainingCents === 0 &&
      paymentAllocations.every((row) => {
        const method = availablePaymentMethods.find((option) => option.id === row.paymentMethodId);
        return Number(row.amount) > 0 && (!method?.requiresReference || row.reference.trim().length > 0);
      })
    );
  const deferredBilling =
    saleType === "partner" ||
    (saleType === "employee" && billingCycle !== "immediate");
  const productAvailableStock = (product: CafeProductListItem) => (product.currentStock ?? 0)
    + (completedEdit && editInvoice?.inventoryPosted ? reservedProductQuantity(editInvoice.items ?? [], product.id) : 0);
  const invoiceUnitPrice = (product: CafeProductListItem, variant?: CafeProductVariant) => Number(
    (completedEdit ? editInvoice?.items?.find(item => item.cafeProductId === product.id && (item.cafeVariantId ?? undefined) === variant?.id)?.unitPrice : undefined)
    ?? variant?.sellPrice ?? product.sellPrice,
  );

  const addResolvedToCart = (
    p: CafeProductListItem,
    variant?: CafeProductVariant,
  ) => {
    const availableStock = productAvailableStock(p);
    if (p.productType === "ready" && availableStock <= 0) {
      toast.error(ui("هذا المنتج نفد من المخزون"));
      return;
    }
    const targetKey = `${p.id}:${variant?.id ?? "base"}`;
    setHighlightedLineKey(targetKey);
    setCart((prev) => {
      if (p.productType === 'ready' && prev.filter(line => line.cafeProductId === p.id).reduce((sum, line) => sum + line.quantity, 0) >= availableStock) {
        toast.error(ui('لا يمكن إضافة كمية أكبر من الموجود بالمخزون'));
        return prev;
      }
      const idx = prev.findIndex((line) => cartLineKey(line) === targetKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          cafeProductId: p.id,
          cafeVariantId: variant?.id,
          variantName: variant?.name,
          itemNote: "",
          name: p.name,
          productCode: p.productCode,
          unitPrice: invoiceUnitPrice(p, variant),
          quantity: 1,
          imageUrl: p.imageUrl,
          productType: p.productType,
          currentStock: p.currentStock != null ? availableStock : null,
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
            next + prev.filter(other => other.cafeProductId === l.cafeProductId && cartLineKey(other) !== lineKey).reduce((sum, other) => sum + other.quantity, 0) > l.currentStock
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
    if (nextBranchId === effectiveBranchId || draftId || completedEdit) return;
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
      setSplitPayment(false);
      setPaymentAllocations([]);
      setPaymentReference("");
    }
    setBranchId(nextBranchId);
    setMemberCode("");
    setLinkedMember(null);
    setMemberSearchOpen(false);
    setMemberScannerOpen(false);
  };

  const checkout = async (onHold = false, allowIngredientShortage = false) => {
    if (saving) return;
    const permission = completedEdit ? 'gym-sales.sales.drafts:update' : draftId ? "gym-sales.sales.new_receipt:update" : "gym-sales.sales.new_receipt:create";
    if (completedEdit && (!editInvoice || editConflict || editFinished || onHold)) return;
    if (!can(permission)) return;
    if (!cart.length || !effectiveBranchId) {
      toast.error(ui("أضف منتجات واختر الفرع"));
      return;
    }
    if (total < 0) {
      toast.error(ui("الإجمالي غير صالح"));
      return;
    }
    if (saleType === "employee" && !employeeId)
      return toast.error(ui("اختر الموظف"));
    if (saleType === 'employee' && (!employeeBenefitsQuery.data || employeeBenefitsQuery.isError)) {
      void employeeBenefitsQuery.refetch();
      return toast.error(ui('انتظر تحميل رصيد الموظف ثم أعد المحاولة'));
    }
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
    if (saleType === "customer" && normalizedPhone && !customerName.trim()) {
      toast.error(ui("أدخل اسم العميل ليتم حفظه مع رقم الموبايل"));
      return;
    }
    if (!onHold && total > 0 && !deferredBilling && !mixedPaymentValid) {
      toast.error(ui("أكمل توزيع المبلغ وأدخل مراجع وسائل الدفع المطلوبة"));
      return;
    }
    if (!onHold && total > 0 && !deferredBilling && !splitPayment && selectedPaymentMethod?.requiresReference && !paymentReference.trim()) {
      toast.error(ui("اكتب رقم مرجع وسيلة الدفع"));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        branchId: Number(effectiveBranchId),
        customerName: customerName || ui("عميل نقدي"),
        customerPhone: normalizedPhone || undefined,
        customerMemberId: saleType === "customer" ? linkedMember?.id : undefined,
        saleType,
        employeeId: saleType === "employee" ? Number(employeeId) : undefined,
        expectedEmployeeFreeDrinks: saleType === 'employee' ? freeDrinks.count : undefined,
        partnerId: saleType === "partner" ? Number(partnerId) : undefined,
        billingCycle: saleType === "customer" ? undefined : billingCycle,
        discountPercentage: discountPctNum,
        paymentMethod: splitPayment ? "mixed" : paymentMethod,
        catalogPaymentMethodId: !splitPayment && Number(selectedPaymentMethodId) > 0 ? Number(selectedPaymentMethodId) : undefined,
        paymentReference: !splitPayment && paymentReference.trim() ? paymentReference.trim() : undefined,
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
      if (!onHold && splitPayment) {
        payload.payments = paymentAllocations.map((row) => {
          const method = availablePaymentMethods.find((option) => option.id === row.paymentMethodId);
          return {
            method: method?.method ?? "card",
            amount: Number(row.amount),
            catalogPaymentMethodId: row.paymentMethodId > 0 ? row.paymentMethodId : undefined,
            reference: row.reference.trim() || undefined,
          };
        });
      }
      const { data } = completedEdit
        ? await api.put(`/quick-sales/${editId}/completed`, { ...payload, expectedRevision: editInvoice!.editRevision ?? 0 })
        : draftId
        ? onHold
          ? await api.put(`/quick-sales/${draftId}/draft`, payload)
          : await api.post(`/quick-sales/${draftId}/finalize`, payload)
        : await api.post("/quick-sales", payload);
      if (onHold) {
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setMemberCode("");
        setLinkedMember(null);
        setMemberSearchOpen(false);
        setReceiptComment("");
        setPaymentReference("");
        setSplitPayment(false);
        setPaymentAllocations([]);
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
      const receiptPayments = (data.payments ?? []).map((payment: {
        method: string;
        amount: number;
        reference?: string | null;
        methodName?: string | null;
      }) => ({
        methodName: payment.methodName || payment.method,
        amount: payment.amount,
        reference: payment.reference || undefined,
      }));
      const completedReceipt: PosReceiptData = savedPosReceipt(data, {
        saleNumber: data.saleNumber,
        dailyNumber: data.dailyNumber,
        saleDate: data.saleDate,
        paymentMethod: receiptPayments.map((payment: { methodName: string }) => payment.methodName).join(" + ") || data.paymentMethod,
        payments: receiptPayments,
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
      });
      setLastReceipt(completedReceipt);
      setShowPrint(true);
      if (canPrint) {
        void dispatchPosPrintJobs(completedReceipt, printTemplates).catch(() =>
          toast.error(
            ui(
              "تم تأكيد الطلب، وتعذر إرسال مهام الطباعة. استخدم أزرار إعادة الطباعة.",
            ),
          ),
        );
      }
      setPaymentOpen(false);
      setOrderReviewOpen(false);
      setCashTendered("");
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setMemberCode("");
      setLinkedMember(null);
      setMemberSearchOpen(false);
      setReceiptComment("");
      setPaymentReference("");
      setSplitPayment(false);
      setPaymentAllocations([]);
      // Refresh sales and stock; every sale is attributed directly to the signed-in user.
      void queryClient.invalidateQueries({ queryKey: ["quick-sales"] });
      void queryClient.invalidateQueries({ queryKey: ["cafe-customers"] });
      for (const key of ['finance', 'revenues', 'expenses', 'cafe-dashboard']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      void queryClient.invalidateQueries({
        queryKey: ["billing-account-sales"],
      });
      void queryClient.invalidateQueries({ queryKey: ["billing-statements"] });
      void queryClient.invalidateQueries({ queryKey: ["cafe-products"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["cafe-reports"] });
      toast.success(ui(completedEdit ? 'تم تعديل الفاتورة وتسوية الفرق' : "تم إتمام البيع"));
      if (completedEdit) {
        setEditFinished(true);
      }
    } catch (e) {
      if (saleType === 'employee') void employeeBenefitsQuery.refetch();
      if (axios.isAxiosError(e)) {
        if (completedEdit && e.response?.status === 409) setEditConflict(true);
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
    if (!can("gym-sales.sales.new_receipt:create")) return;
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

  const posUtilityActions = (
    <div className="flex items-center gap-2" aria-label={ui("أدوات نقطة البيع السريعة")}>
      <Button
        permissionAction={null}
        type="button"
        variant="outline"
        size="icon"
        className="size-11 shrink-0 border-amber-300 bg-amber-50 text-amber-800 shadow-sm hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200"
        aria-label={ui("مسح كود العضو")}
        title={ui("مسح كود العضو")}
        onClick={() => {
          setSaleType("customer");
          setBillingCycle("immediate");
          setMemberScannerOpen(true);
        }}
      >
        <ScanBarcode className="size-5" />
      </Button>
      <Button
        permissionAction={null}
        type="button"
        variant="outline"
        size="icon"
        className="size-11 shrink-0 border-amber-300 bg-amber-50 text-amber-800 shadow-sm hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200"
        aria-label={ui("فتح الحاسبة")}
        title={ui("فتح الحاسبة")}
        onClick={() => setCalculatorOpen(true)}
      >
        <Calculator className="size-5" />
      </Button>
      <Button
        permissionAction={null}
        asChild
        variant="outline"
        className="h-11 border-primary/30 bg-primary/5 px-4 font-bold text-primary shadow-sm hover:bg-primary/10"
      >
        <Link to="/sales/drafts">
          <FileClock className="me-2 size-4" />
          {ui("فواتير الورديات")}
        </Link>
      </Button>
    </div>
  );

  const canCheckout = can(completedEdit ? 'gym-sales.sales.drafts:update' : draftId ? 'gym-sales.sales.new_receipt:update' : 'gym-sales.sales.new_receipt:create') && (!completedEdit || (!!editInvoice && !editConflict && !editFinished));
  const paymentValid = total === 0 || deferredBilling || (mixedPaymentValid && availablePaymentMethods.length > 0 && (splitPayment || !selectedPaymentMethod?.requiresReference || !!paymentReference.trim()));
  const finalCashAmount = deferredBilling ? 0 : splitPayment
    ? paymentAllocations.reduce((sum, row) => availablePaymentMethods.find(method => method.id === row.paymentMethodId)?.method === 'cash' ? sum + (Number(row.amount) || 0) : sum, 0)
    : (selectedPaymentMethod?.method ?? paymentMethod) === 'cash' ? total : 0;
  const previousPayments = deferredBilling || !completedEdit || !editInvoice ? [] : editInvoice.payments?.length
    ? editInvoice.payments.map(payment => ({ method: payment.method, amount: Number(payment.amount) }))
    : [{ method: editInvoice.paymentMethod, amount: Number(editInvoice.totalAmount) }];
  const finalPayments = deferredBilling ? [] : splitPayment
    ? paymentAllocations.map(row => ({ method: availablePaymentMethods.find(method => method.id === row.paymentMethodId)?.method ?? 'card', amount: Number(row.amount) || 0 }))
    : [{ method: selectedPaymentMethod?.method ?? paymentMethod, amount: total }];
  const paymentChanges = completedInvoicePaymentChanges(previousPayments, finalPayments);
  const cashDue = completedEdit ? Math.max(0, paymentChanges.find(change => change.method === 'cash')?.difference ?? 0) : finalCashAmount;
  const openPayment = () => { setOrderReviewOpen(false); setPaymentOpen(true); };
  const paymentControls = <>{!deferredBilling && <>
                <div className="border-t pt-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Label className="font-black">{ui("طريقة الدفع")}</Label>
                    {allowMixed ? (
                      <Button
                        permissionAction={null}
                        type="button"
                        size="sm"
                        variant={splitPayment ? "default" : "outline"}
                        onClick={() => {
                          if (splitPayment) {
                            setSplitPayment(false);
                            return;
                          }
                          const eligible = availablePaymentMethods.filter((method) => method.supportsMixedPayment).slice(0, 2);
                          if (eligible.length < 2) return;
                          const firstCents = Math.floor(Math.round(total * 100) / 2);
                          setPaymentAllocations([
                            { ...newPaymentAllocation(eligible[0].id), amount: (firstCents / 100).toFixed(2) },
                            { ...newPaymentAllocation(eligible[1].id), amount: ((Math.round(total * 100) - firstCents) / 100).toFixed(2) },
                          ]);
                          setSplitPayment(true);
                        }}
                      >
                        <Plus className="size-3.5" />
                        {ui(splitPayment ? "إلغاء إضافة طريقة الدفع" : "إضافة طريقة دفع")}
                      </Button>
                    ) : null}
                  </div>

                  {!splitPayment ? (
                    <div className="grid grid-cols-2 gap-2">
                      {availablePaymentMethods.map((option) => {
                        const Icon = option.method === "cash"
                          ? Banknote
                          : option.method === "transfer"
                            ? Landmark
                            : option.method === "wallet"
                              ? WalletCards
                              : CreditCard;
                        const selected = selectedPaymentMethodId === String(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={selected}
                            className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-start transition ${selected ? "border-primary bg-primary text-primary-foreground shadow-md" : "bg-background hover:border-primary/40 hover:bg-primary/[0.035]"}`}
                            onClick={() => {
                              setSelectedPaymentMethodId(String(option.id));
                              setPaymentMethod(option.method);
                              setPaymentReference("");
                            }}
                          >
                            <span className={`grid size-7 shrink-0 place-items-center rounded-md ${selected ? "bg-white/15" : "bg-muted text-muted-foreground"}`}><Icon className="size-3.5" /></span>
                            <span className="min-w-0 text-[11px] font-black leading-4">{option.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {!availablePaymentMethods.length ? (
                  <div className="mt-2 space-y-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200" role={paymentCatalogQuery.isError ? 'alert' : 'status'}>
                    <p>{paymentCatalogQuery.isLoading
                      ? ui("جاري تحميل طرق الدفع…")
                      : paymentCatalogQuery.isError
                        ? ui("تعذر تحميل طرق الدفع. لا يمكن تأكيد البيع قبل إعادة المحاولة.")
                        : ui("لا توجد طريقة دفع مفعّلة. فعّل طريقة واحدة على الأقل من إعدادات نقطة البيع.")}</p>
                    {paymentCatalogQuery.isError ? (
                      <Button permissionAction={null} type="button" size="sm" variant="outline" onClick={() => void paymentCatalogQuery.refetch()}>
                        {ui("إعادة المحاولة")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {!splitPayment && availablePaymentMethods.find((option) => String(option.id) === selectedPaymentMethodId)?.requiresReference ? (
                  <div>
                    <Label className="text-[11px]">{ui("رقم المرجع")}</Label>
                    <Input className="nums mt-1 h-9" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder={ui("رقم عملية التحويل أو إيصال الماكينة")} />
                  </div>
                ) : null}
            {!deferredBilling && splitPayment ? (
              <PosMixedPaymentPanel
                methods={availablePaymentMethods.filter((method) => method.supportsMixedPayment)}
                rows={paymentAllocations}
                total={total}
                currency={currency}
                ui={ui}
                onChange={setPaymentAllocations}
              />
            ) : null}
  </>}
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
  </>;

  if (completedEdit && (!can('gym-sales.sales.drafts:update') || !editInvoice)) {
    const error = invoiceQuery.error || originalProductsQuery.error || paymentCatalogQuery.error;
    const invalidStatus = draft && draft.status !== 'completed';
    return <GymSalesPageShell section="sales" title={ui('تعديل الفاتورة')}>
      <div className="space-y-4 rounded-xl border bg-card p-6" role="status">
        <p>{!can('gym-sales.sales.drafts:update') ? ui('ليس لديك صلاحية تعديل فواتير الورديات') : invalidStatus ? ui('لا يمكن تعديل فاتورة غير مكتملة') : error ? apiError(error, ui('تعذر تحميل الفاتورة ومخزون منتجاتها')) : ui('جاري تحميل الفاتورة وطرق الدفع ومخزون المنتجات…')}</p>
        {error && <Button permissionAction={null} variant="outline" onClick={() => { void invoiceQuery.refetch(); void originalProductsQuery.refetch(); void paymentCatalogQuery.refetch(); }}>{ui('إعادة المحاولة')}</Button>}
        <Button asChild variant="outline" permissionAction={null}><Link to="/sales/drafts">{ui('العودة لفواتير الورديات')}</Link></Button>
      </div>
    </GymSalesPageShell>;
  }

  return (
    <TouchKeypadContext.Provider value={posSettings?.find((setting) => setting.key === 'touch_keypad_enabled')?.value === true}>
    <GymSalesPageShell
      section="sales"
      title={completedEdit ? `${ui('تعديل الفاتورة')} ${editInvoice?.saleNumber ?? ''}` : draftId ? ui("تعديل فاتورة معلقة") : ui("نقطة بيع الكافيه")}
      description={ui(
        "اختيار أسرع للمنتجات، طلب مرتب، وتأكيد فوري متزامن مع المخزون",
      )}
    >
      {completedEdit && <div className="mb-4 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-semibold">{ui('أضف أو احذف المنتجات وعدّل الكميات، ثم راجع فرق الحساب وأكّد التعديل.')}</p>
        <p className="text-muted-foreground">{ui('التعديل متاح قبل إغلاق وردية الفاتورة أو إضافتها إلى كشف حساب. سيبقى رقم الفاتورة والفرع وصاحب الحساب كما هم.')}</p>
        <p className="text-muted-foreground">{ui('أسعار الأصناف الموجودة والضريبة محفوظة كما في الفاتورة الأصلية؛ الأصناف الجديدة بسعرها الحالي.')}</p>
        {editConflict && <p role="alert" className="font-semibold text-destructive">{ui('تغيّرت الفاتورة أثناء التعديل. ارجع لفواتير الورديات وافتحها من جديد لمراجعة أحدث نسخة قبل الحفظ.')}</p>}
      </div>}
      {!draftId && !completedEdit ? (
        <PosShiftSwitcher actions={posUtilityActions} />
      ) : (
        <div className="mb-4 flex justify-end">{posUtilityActions}</div>
      )}
      <div className="grid items-start gap-5 pb-24 lg:pb-0 lg:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-3 rounded-2xl border bg-gradient-to-l from-primary/10 via-card to-card p-4 shadow-sm">
            <div className="min-w-[140px] flex-1">
              <Label className="text-xs">{ui("الفرع")}</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={effectiveBranchId}
                onChange={(e) => void changeBranch(e.target.value)}
                disabled={draftId > 0 || completedEdit || (branches?.length ?? 0) <= 1}
              >
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
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

          <PosProductBrowserFrame
            frameLabel={ui("اختيار منتجات الطلب")}
            categoriesLabel={ui("فئات المنتجات")}
            productsLabel={ui("قائمة المنتجات القابلة للتمرير")}
            categories={
              <PosCategoryGrid
                categories={categories ?? []}
                activeCategoryId={categoryId}
                onSelect={setCategoryId}
              />
            }
            products={
              <div className="space-y-4">
              <div className="grid justify-start gap-x-4 gap-y-12 pt-10 [grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))]">
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
                          p.productType === "ready" && productAvailableStock(p) <= 0
                        }
                        className={`group relative flex w-full min-w-0 max-w-[210px] flex-col items-center rounded-3xl border bg-card px-3 pb-3 pt-20 text-center shadow-[0_14px_36px_-26px_rgba(15,82,150,.8)] transition hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-55 ${inCartQuantity > 0 ? "border-primary ring-2 ring-primary/15" : ""}`}
                      >
                        <span className="absolute -top-12 left-1/2 size-32 -translate-x-1/2 rounded-full bg-card p-1.5 shadow-xl ring-1 ring-border transition-transform group-hover:scale-105">
                          <img
                            src={resolveProductImageUrl(p.imageUrl)}
                            alt={p.name}
                            className="size-full rounded-full bg-muted object-cover"
                            loading="eager"
                            decoding="async"
                            onError={(event) => applyProductImageFallback(event.currentTarget)}
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
                        <p className="mt-1 min-h-10 break-words text-sm font-black leading-5">
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
                          {toArabicDigits(invoiceUnitPrice(p))}{" "}
                          <span className="text-[10px] font-bold">{currency}</span>
                        </p>
                        <div className="mt-auto flex min-h-5 items-center justify-center pt-1.5">
                          {p.productType === "ready" ? (
                            <span
                              className={`nums rounded-full px-3 py-1 text-xs font-black ${productAvailableStock(p) > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                            >
                              {ui(completedEdit ? 'متاح للفاتورة' : "متبقي")} {toArabicDigits(productAvailableStock(p))}
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
            }
          />
        </div>

        <Card ref={cartViewportRef}
          data-pos-cart
          className="flex min-h-0 min-w-0 flex-col self-start overflow-hidden border shadow-xl lg:sticky lg:top-4 lg:max-h-[var(--pos-cart-height,calc(100dvh-8rem))]">
          <CardHeader className="shrink-0 border-b bg-gradient-to-l from-primary/15 via-primary/5 to-card pb-4">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                {ui("سلة الطلب")}
              </span>
              <span className="flex flex-wrap items-center gap-2">
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
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div
              data-pos-checkout-scroll
              className="space-y-3 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]"
            >
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  [
                    "customer",
                    `${ui("عميل")} · ${toArabicDigits(configuredCustomerDiscount)}%`,
                  ],
                  [
                    "employee",
                    `${ui("موظف")} · ${toArabicDigits(configuredEmployeeDiscount)}%`,
                  ],
                  [
                    "partner",
                    `${ui("شريك")} · ${toArabicDigits(configuredPartnerDiscount)}%`,
                  ],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={saleType === value ? "default" : "ghost"}
                  disabled={completedEdit}
                  onClick={() => {
                    setSaleType(value);
                    setBillingCycle(
                      value === "partner"
                        ? "monthly"
                        : value === "employee"
                          ? "daily"
                          : "immediate",
                    );
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>

            {saleType === "customer" ? (
              <section className="rounded-xl border border-primary/15 bg-primary/[0.025] px-3 py-2.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="text-xs font-bold">{ui("بيانات العميل")}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ui("امسح كود العضو، أو أدخل الاسم والموبايل يدويًا")}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0 sm:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="cafeMemberCode" className="text-[11px]">
                        {ui("كود العضو")}
                      </Label>
                      {memberSearchLoading ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          {ui("جاري البحث")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-stretch gap-2">
                      <Input
                        id="cafeMemberCode"
                        dir="ltr"
                        autoComplete="off"
                        aria-autocomplete="list"
                        aria-controls="cafeMemberSuggestions"
                        aria-expanded={memberSearchOpen && debouncedMemberCode.length >= 2}
                        className="nums h-11 min-w-0 flex-1 text-start text-base font-semibold"
                        value={memberCode}
                        maxLength={30}
                        placeholder={ui("امسح أو اكتب كود العضو")}
                        onFocus={() => setMemberSearchOpen(true)}
                        onChange={(event) => {
                          if (linkedMember) {
                            setCustomerName("");
                            setCustomerPhone("");
                          }
                          setMemberCode(event.target.value);
                          setLinkedMember(null);
                          setMemberSearchOpen(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setMemberSearchOpen(false);
                            return;
                          }
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (memberSuggestions[0]) {
                              selectGymMember(memberSuggestions[0]);
                            } else {
                              void lookupGymMember(event.currentTarget.value);
                            }
                          }
                        }}
                      />
                      <Button
                        permissionAction={null}
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-11 shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                        aria-label={ui("البحث بكود العضو")}
                        title={ui("البحث بكود العضو")}
                        disabled={memberLookupLoading}
                        onClick={() => void lookupGymMember(memberCode)}
                      >
                        {memberLookupLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Search className="size-4" />
                        )}
                      </Button>
                    </div>
                    {memberSearchOpen && debouncedMemberCode.length >= 2 ? (
                      <div
                        id="cafeMemberSuggestions"
                        role="listbox"
                        aria-label={ui("أقرب نتائج الأعضاء")}
                        className="mt-2 overflow-hidden rounded-lg border bg-background shadow-[0_12px_28px_-20px_rgba(15,23,42,0.55)]"
                      >
                        {memberSuggestions.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            role="option"
                            aria-selected={false}
                            className="flex min-h-12 w-full items-center gap-3 border-b px-3 py-2 text-start transition-colors last:border-b-0 hover:bg-primary/[0.06] focus-visible:bg-primary/[0.08] focus-visible:outline-none"
                            onClick={() => selectGymMember(member)}
                          >
                            <span className="nums min-w-20 shrink-0 rounded-md bg-primary/10 px-2 py-1 text-center text-xs font-black text-primary">
                              {member.memberCode}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold">
                                {member.name}
                              </span>
                              <span className="nums block truncate text-[11px] text-muted-foreground">
                                {member.phone || ui("لا يوجد رقم موبايل")}
                              </span>
                            </span>
                            <span
                              className={`size-2 shrink-0 rounded-full ${
                                member.isActive ? "bg-emerald-500" : "bg-amber-500"
                              }`}
                              title={member.isActive ? ui("عضوية نشطة") : ui("عضوية غير نشطة")}
                            />
                          </button>
                        ))}
                        {!memberSearchLoading && memberSearch && memberSuggestions.length === 0 ? (
                          <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                            {ui("لا يوجد عضو مطابق — أكمل الاسم والموبايل يدويًا")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="cafeCustomerPhone" className="text-[11px]">
                      {ui("رقم الموبايل")}
                    </Label>
                    <div className="relative mt-1">
                      <Input
                        id="cafeCustomerPhone"
                        dir="ltr"
                        inputMode="tel"
                        className="nums h-10 pe-9 text-start text-base sm:h-9 sm:text-sm"
                        value={customerPhone}
                        maxLength={20}
                        placeholder="01012345678"
                        onChange={(event) => {
                          setCustomerPhone(event.target.value);
                          if (!linkedMember) setCustomerName("");
                        }}
                      />
                      {customerLookupLoading ? (
                        <Loader2 className="absolute end-3 top-2.5 size-4 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="cafeCustomerName" className="text-[11px]">
                      {ui("اسم العميل")}
                    </Label>
                    <Input
                      id="cafeCustomerName"
                      className="mt-1 h-10 text-base sm:h-9 sm:text-sm"
                      value={customerName}
                      maxLength={100}
                      placeholder={ui("اسم العميل")}
                      onChange={(event) => setCustomerName(event.target.value)}
                    />
                  </div>
                </div>
                {linkedMember ? (
                  <p
                    className={`mt-2 truncate text-[11px] font-semibold ${
                      linkedMember.isActive
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                    title={`${linkedMember.memberCode} · ${linkedMember.name}`}
                  >
                    {linkedMember.isActive
                      ? ui("مرتبط بعضو الجيم")
                      : ui("تم العثور على العضو — العضوية غير نشطة")}
                    {" · "}
                    <span className="nums">{linkedMember.memberCode}</span>
                    {" · "}
                    {linkedMember.name}
                  </p>
                ) : validCustomerPhone && customerLookup?.found ? (
                  <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    {ui("تم العثور على عميل سابق وملء الاسم تلقائيًا")}
                  </p>
                ) : validCustomerPhone && customerLookup && !customerLookup.found ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {ui("عميل جديد — اكتب الاسم وسيُحفظ مع أول فاتورة")}
                  </p>
                ) : null}
              </section>
            ) : null}

            {saleType === "employee" && (
              <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                <Combobox
                  value={employeeId}
                  onValueChange={setEmployeeId}
                  disabled={completedEdit}
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
                      disabled={completedEdit}
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
            {saleType === 'employee' && employeeId && <div className="rounded-xl border bg-background p-3 text-sm" aria-live="polite">
              {employeeBenefitsQuery.isError ? <button type="button" className="min-h-11 text-destructive underline" onClick={() => void employeeBenefitsQuery.refetch()}>{ui('تعذر تحميل رصيد الموظف — اضغط للمحاولة')}</button> : !employeeBenefitsQuery.data ? ui('جاري تحميل رصيد الموظف…') : employeeBenefitsQuery.data.enabled ? <>
                <p className="font-bold">{ui('رصيد المشروبات المجانية اليوم')}: <span className="nums">{toArabicDigits(employeeBenefitsQuery.data.remaining)}</span></p>
                <p className="mt-1 text-muted-foreground">{ui('المجاني في هذا الطلب')}: <span className="nums">{toArabicDigits(freeDrinks.count)}</span> · {ui('المتبقي بعده')}: <span className="nums">{toArabicDigits(Math.max(0, employeeBenefitsQuery.data.remaining - freeDrinks.count))}</span></p>
              </> : ui('المشروبات المجانية غير مفعلة في هذا الفرع')}
            </div>}
            {saleType === "partner" && (
              <div className="grid gap-2 rounded-xl border bg-muted/20 p-3">
                <Combobox
                  value={partnerId}
                  onValueChange={setPartnerId}
                  disabled={completedEdit}
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
                    disabled={completedEdit}
                    onClick={() => setBillingCycle("daily")}
                  >
                    {ui("تجميع يومي")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={billingCycle === "monthly" ? "default" : "ghost"}
                    disabled={completedEdit}
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
                    cart.map((l, lineIndex) => {
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
                              onError={(event) => applyProductImageFallback(event.currentTarget)}
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
                                <Button permissionAction={null}
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
                              {freeDrinks.quantities[lineIndex] > 0 && <p className="mt-1 text-sm font-bold text-emerald-800 dark:text-emerald-200">{ui('مجاني للموظف')}: {toArabicDigits(freeDrinks.quantities[lineIndex])}</p>}
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
                      <ChevronsUpDown className="size-3.5" />
                      {ui("اسحب لعرض باقي المنتجات")}
                    </span>
                  </div>
                ) : null}
              </div>
            </section>

            {!deferredBilling && (
              <section className="space-y-3 rounded-2xl border bg-muted/20 p-3">
                <div className="grid grid-cols-[1fr_90px] items-end gap-2">
                  <div>
                    <Label className="text-[11px]">
                      {saleType === "employee"
                        ? ui("خصم الموظف %")
                        : ui("خصم العميل %")}
                    </Label>
                    <Input
                      className="nums mt-1 h-9"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={saleType === 'employee' && !employeeDiscountEnabled ? '0' : discountPct}
                      disabled={saleType === 'employee' && !employeeDiscountEnabled}
                      onChange={(event) => setDiscountPct(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">{ui("الضريبة")}</Label>
                    <div className="nums mt-1 grid h-9 place-items-center rounded-md border bg-background text-sm font-bold text-muted-foreground">
                      {toArabicDigits(effectiveTaxPct)}%
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {ui("النسبة تخص هذه الفاتورة فقط ولا تغيّر الإعدادات العامة")}
                </p>

              </section>
            )}

            {deferredBilling && (
              <section className="rounded-2xl border bg-muted/20 p-3">
                <Label className="text-[11px]">
                  {saleType === "partner" ? ui("خصم الشريك %") : ui("خصم الموظف %")}
                </Label>
                <Input className="nums mt-1 h-9" type="number" min={0} max={100} step="0.01" value={!completedEdit && saleType === 'employee' && !employeeDiscountEnabled ? '0' : discountPct} disabled={!completedEdit && saleType === 'employee' && !employeeDiscountEnabled} onChange={(event) => setDiscountPct(event.target.value)} />
                <p className="mt-1 text-[10px] text-muted-foreground">{ui("النسبة تخص هذه الفاتورة فقط ولا تغيّر الإعدادات العامة")}</p>
              </section>
            )}



            </div>

            <div
              data-pos-checkout-dock
              className="relative z-10 shrink-0 space-y-2 border-t bg-card p-3 shadow-[0_-16px_34px_-28px_rgba(15,23,42,.75)]"
            >
            <div className="rounded-xl bg-gradient-to-l from-primary/[0.09] to-transparent p-2.5">
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
                  {saleType === "partner"
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

            <div className={`grid gap-2 ${completedEdit ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {!completedEdit && <Button
                permissionAction={null}
                variant="outline"
                className="h-14 border-amber-300 bg-amber-50 text-sm font-bold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-200"
                disabled={!cart.length || saving || !can(draftId ? "gym-sales.sales.new_receipt:update" : "gym-sales.sales.new_receipt:create")}
                onClick={() => void checkout(true)}
              >
                <PauseCircle className="me-2 size-5" />
                {ui("تعليق وحفظ")}
              </Button>}
              <Button
                permissionAction={null}
                className="h-14 text-sm font-bold shadow-lg shadow-primary/20"
                disabled={!cart.length || saving}
                onClick={() => setOrderReviewOpen(true)}
              >
                <Banknote className="me-2 size-5" />
                {ui("مراجعة ودفع")}
              </Button>
            </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {cart.length ? (
        <div
          data-pos-mobile-checkout-jump
          className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-slate-950 p-2.5 text-white shadow-[0_18px_48px_-16px_rgba(15,23,42,.75)] lg:hidden"
        >
          <div className="min-w-0 px-1">
            <p className="text-[10px] text-slate-300">{ui("إجمالي الطلب")}</p>
            <p className="nums truncate text-lg font-black">
              {toArabicDigits(total.toFixed(2))}{" "}
              <small className="text-[10px] text-slate-300">{currency}</small>
            </p>
          </div>
          <Button
            permissionAction={null}
            type="button"
            className="h-11 shrink-0 bg-white px-4 font-black text-slate-950 hover:bg-slate-100"
            onClick={() =>
              document
                .querySelector<HTMLElement>("[data-pos-checkout-dock]")
                ?.scrollIntoView({ behavior: "smooth", block: "end" })
            }
          >
            <ShoppingCart className="me-2 size-4" />
            {ui("مراجعة وتأكيد")}
          </Button>
        </div>
      ) : null}
      <PosCalculatorDialog
        open={calculatorOpen}
        onOpenChange={setCalculatorOpen}
        ui={ui}
      />
      <PosOrderReviewDialog
        open={orderReviewOpen}
        onOpenChange={setOrderReviewOpen}
        lines={cart.map((line) => ({
          id: cartLineKey(line),
          name: line.name,
          productCode: line.productCode,
          variantName: line.variantName,
          itemNote: line.itemNote,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          imageUrl: line.imageUrl,
        }))}
        subtotal={subtotal}
        discountAmount={discountAmount}
        taxAmount={taxAmount}
        total={total}
        currency={currency}
        ui={ui}
        onQuantityChange={updateQty}
        onRemove={id => setCart(current => current.filter(line => cartLineKey(line) !== id))}
        onPay={openPayment}
        canPay={canCheckout}
        busy={saving}
      />
      <PosPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} total={total} cashDue={cashDue} currency={currency}
        tendered={cashTendered} onTenderedChange={setCashTendered} controls={paymentControls}
        canConfirm={cart.length > 0 && canCheckout && paymentValid} busy={saving} deferred={deferredBilling}
        editSummary={completedEdit && editInvoice ? { previousTotal: Number(editInvoice.totalAmount), previousPaid: previousPayments.reduce((sum, payment) => sum + payment.amount, 0), changes: paymentChanges } : undefined}
        onConfirm={() => void checkout(false)} ui={ui} />
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
                onError={(event) => applyProductImageFallback(event.currentTarget)}
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
          <div className="grid gap-3">
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
                  className="flex min-h-20 w-full items-center justify-between gap-4 rounded-xl border-2 border-border bg-card p-4 text-start transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-words text-lg font-bold">{variant.name}</span>
                    {variant.isDefault ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                        {ui("الافتراضي")}
                      </span>
                    ) : null}
                  </span>
                  <span className="nums shrink-0 text-xl font-black text-primary">
                    {toArabicDigits(invoiceUnitPrice(variantProduct!, variant).toFixed(2))}{" "}
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
                  disabled={!!resolvingShortage || !can("gym-sales.sales.new_receipt:create")}
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
                  disabled={!!resolvingShortage || !canCheckout}
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
      <CameraBarcodeScanner
        open={memberScannerOpen}
        onOpenChange={setMemberScannerOpen}
        onDetected={(code) => {
          void lookupGymMember(code);
        }}
        title={ui("مسح كود العضو")}
        description={ui("وجّه الكاميرا إلى كود العضو أو باركود البطاقة لملء بياناته تلقائيًا")}
        footerHint={ui("يُغلق تلقائيًا بعد العثور على العضو")}
      />
      <PosReceiptPrint
        open={showPrint}
        onOpenChange={open => {
          setShowPrint(open);
          if (!open && completedEdit && editFinished) {
            setLastReceipt(null);
            navigate('/sales/drafts', { replace: true });
          }
        }}
        receipt={lastReceipt}
        templates={printTemplates}
        confirmationOnly={!completedEdit}
        onDone={() => setLastReceipt(null)}
      />
    </GymSalesPageShell>
    </TouchKeypadContext.Provider>
  );
}
