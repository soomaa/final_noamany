import { Monitor, RefreshCw, Smartphone, Maximize2 } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { getPortalPreviewTarget, normalizePortalPreviewDraft, type PortalPreviewEntityId, type PortalPreviewSurface } from '@/lib/portal-preview-model';
import { Button } from '@/components/ui/button';
import './portal-live-preview.css';

type PreviewPayload = { surface: PortalPreviewSurface; entityType: string; entityId: PortalPreviewEntityId; draft: Record<string, unknown> };
type MessageTarget = Pick<Window, 'postMessage'>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const BLOCKED_DRAFT_KEYS = /(token|authorization|access|refresh|response)/i;

export function createPortalDraftKey(configType: string, entityId: PortalPreviewEntityId) {
  return `noamany:portal-draft:${configType}:${entityId}`;
}

function normalizedDraftKey(key: string) { return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(); }
function fieldsOnly(draft: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(draft).filter(([key]) => !BLOCKED_DRAFT_KEYS.test(normalizedDraftKey(key))).map(([key, value]) => [key, scrubDraftValue(value)]));
}
function scrubDraftValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubDraftValue);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return fieldsOnly(value as Record<string, unknown>);
}

export function writePortalDraft(storage: StorageLike, key: string, draft: Record<string, unknown>) {
  storage.setItem(key, JSON.stringify({ version: 1, fields: fieldsOnly(draft) }));
}

export function readPortalDraft(storage: StorageLike, key: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null');
    return value?.version === 1 && value.fields && typeof value.fields === 'object' && !Array.isArray(value.fields) ? fieldsOnly(value.fields) : null;
  } catch { return null; }
}

export function removePortalDraft(storage: StorageLike, key: string) { storage.removeItem(key); }
export function restorePortalDraft(storage: StorageLike, key: string, baseline: Record<string, unknown>) {
  const saved = readPortalDraft(storage, key);
  return saved ? { values: { ...baseline, ...saved }, restored: true } : { values: baseline, restored: false };
}
export async function publishPortalDraft<T>(storage: StorageLike | null | undefined, key: string, publish: () => Promise<T>): Promise<T> {
  const result = await publish();
  if (storage) removePortalDraft(storage, key);
  return result;
}

export function createPreviewUrl(baseUrl: string, path: string, nonce: string) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('cmsPreview', '1');
  url.searchParams.set('previewNonce', nonce);
  return url.toString();
}

export class PortalPreviewSender {
  private ready = false;
  private latest: PreviewPayload | null = null;
  private sequence = 0;
  constructor(private readonly session: { nonce: string; targetOrigin: string; frame: MessageTarget | null }) {}
  queue(payload: PreviewPayload) { this.latest = payload; this.flush(); }
  reset() { this.ready = false; }
  receiveReady(event: MessageEvent): boolean {
    if (event.origin !== this.session.targetOrigin || event.source !== this.session.frame) return false;
    if (event.data?.type !== 'noamany:preview-ready' || event.data?.version !== 1 || event.data?.nonce !== this.session.nonce) return false;
    this.ready = true;
    this.flush();
    return true;
  }
  private flush() {
    if (!this.ready || !this.latest || !this.session.frame) return;
    this.session.frame.postMessage({ type: 'noamany:cms-preview', version: 1, nonce: this.session.nonce, sequence: ++this.sequence, ...this.latest }, this.session.targetOrigin);
  }
}

function newNonce(): string | null {
  try {
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) return null;
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

function publicBaseUrl() {
  const env = (import.meta as unknown as { env?: { DEV?: boolean; VITE_PORTAL_PUBLIC_URL?: string } }).env;
  if (env?.DEV) return env.VITE_PORTAL_PUBLIC_URL || 'http://127.0.0.1:5175';
  if (typeof window === 'undefined') return 'http://127.0.0.1:5175';
  return window.location.origin;
}

export function PortalLivePreview({ configType, entityId, draft, options, surfaceLabel, children, previewGate }: {
  configType: string; entityId: PortalPreviewEntityId; draft: Record<string, unknown>; options?: Parameters<typeof normalizePortalPreviewDraft>[3]; surfaceLabel: string; children: ReactNode; previewGate?: { state: 'loading' | 'error'; onRetry: () => void };
}) {
  const [productSurface, setProductSurface] = useState<'product' | 'shop'>(configType === 'products' && typeof entityId === 'number' ? 'product' : 'shop');
  const target = getPortalPreviewTarget(configType, entityId, configType === 'products' ? productSurface : undefined);
  const targetSurface = target?.surface;
  const targetPath = target?.path;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [nonceSeed, setNonceSeed] = useState(0);
  const nonce = useMemo(newNonce, [nonceSeed]);
  const baseUrl = useMemo(publicBaseUrl, []);
  const targetOrigin = useMemo(() => new URL(baseUrl).origin, [baseUrl]);
  const iframeUrl = useMemo(() => targetPath && nonce ? createPreviewUrl(baseUrl, targetPath, nonce) : '', [baseUrl, nonce, targetPath]);
  const senderRef = useRef<PortalPreviewSender | null>(null);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [activePane, setActivePane] = useState<'edit' | 'preview'>('edit');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!nonce || !targetSurface || !iframeRef.current?.contentWindow) return;
    const sender = new PortalPreviewSender({ nonce, targetOrigin, frame: iframeRef.current.contentWindow });
    senderRef.current = sender;
    const ready = (event: MessageEvent) => { if (sender.receiveReady(event)) setState('ready'); };
    window.addEventListener('message', ready);
    return () => window.removeEventListener('message', ready);
  }, [nonce, reloadKey, targetOrigin, targetSurface]);

  const normalizedDraft = useMemo(() => targetSurface ? normalizePortalPreviewDraft(configType, entityId, draft, options) : null, [configType, draft, entityId, options, targetSurface]);
  useEffect(() => {
    if (!previewGate && targetSurface && normalizedDraft) senderRef.current?.queue({ surface: targetSurface, entityType: configType, entityId, draft: normalizedDraft });
  }, [configType, entityId, normalizedDraft, previewGate, reloadKey, targetSurface]);
  useEffect(() => {
    if (state !== 'loading' || previewGate) return;
    const timeout = window.setTimeout(() => setState('error'), 8000);
    return () => window.clearTimeout(timeout);
  }, [previewGate, state, reloadKey]);

  if (!targetSurface) return null;
  const tabBaseId = `portal-preview-${configType}-${String(entityId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const selectPane = (pane: 'edit' | 'preview') => {
    setActivePane(pane);
    document.getElementById(`${tabBaseId}-${pane}-tab`)?.focus();
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const panes: Array<'edit' | 'preview'> = ['edit', 'preview'];
    const current = panes.indexOf(activePane);
    const next = event.key === 'ArrowLeft' ? panes[(current + 1) % panes.length]
      : event.key === 'ArrowRight' ? panes[(current + panes.length - 1) % panes.length]
        : event.key === 'Home' ? 'edit' : event.key === 'End' ? 'preview' : null;
    if (!next) return;
    event.preventDefault();
    selectPane(next);
  };
  const reload = () => { senderRef.current?.reset(); setState('loading'); setNonceSeed(seed => seed + 1); setReloadKey(key => key + 1); };
  const switchProductSurface = (surface: 'product' | 'shop') => {
    if (surface === productSurface) return;
    senderRef.current?.reset();
    setState('loading');
    setProductSurface(surface);
    setNonceSeed(seed => seed + 1);
    setReloadKey(key => key + 1);
  };
  const fullscreen = () => iframeRef.current?.requestFullscreen?.();
  return <section className="portal-live-preview" dir="rtl" data-active-pane={activePane} data-preview-state={state} data-preview-new-record={entityId === 'new' ? 'true' : undefined}>
    <div className="portal-live-preview__mobile-tabs" role="tablist" aria-label="مساحة العمل">
      <button id={`${tabBaseId}-edit-tab`} type="button" role="tab" aria-selected={activePane === 'edit'} aria-controls={`${tabBaseId}-edit-panel`} tabIndex={activePane === 'edit' ? 0 : -1} onClick={() => selectPane('edit')} onKeyDown={onTabKeyDown}>التعديل</button>
      <button id={`${tabBaseId}-preview-tab`} type="button" role="tab" aria-selected={activePane === 'preview'} aria-controls={`${tabBaseId}-preview-panel`} tabIndex={activePane === 'preview' ? 0 : -1} onClick={() => selectPane('preview')} onKeyDown={onTabKeyDown}>المعاينة</button>
    </div>
    <aside id={`${tabBaseId}-edit-panel`} className="portal-live-preview__editor" role="tabpanel" aria-labelledby={`${tabBaseId}-edit-tab`} aria-label="التعديل">{children}</aside>
    <div id={`${tabBaseId}-preview-panel`} className="portal-live-preview__frame-pane" role="tabpanel" aria-labelledby={`${tabBaseId}-preview-tab`} aria-label="المعاينة">
      <div className="portal-live-preview__toolbar">
        <div><strong>{surfaceLabel}</strong><span role="status">معاينة خاصة — غير منشورة</span>{entityId === 'new' && <span className="portal-live-preview__new-record" role="status">معاينة سجل جديد — أكمل الحقول قبل النشر</span>}</div>
        <div className="portal-live-preview__actions">
          {configType === 'products' && typeof entityId === 'number' && <div className="portal-live-preview__surface-switch" role="group" aria-label="سطح معاينة المنتج">
            <Button type="button" variant={productSurface === 'product' ? 'secondary' : 'ghost'} size="sm" aria-pressed={productSurface === 'product'} onClick={() => switchProductSurface('product')}>معاينة التفاصيل</Button>
            <Button type="button" variant={productSurface === 'shop' ? 'secondary' : 'ghost'} size="sm" aria-pressed={productSurface === 'shop'} onClick={() => switchProductSurface('shop')}>معاينة المتجر</Button>
          </div>}
          <Button type="button" variant={viewport === 'desktop' ? 'secondary' : 'ghost'} size="icon" aria-label="عرض سطح المكتب" onClick={() => setViewport('desktop')}><Monitor /></Button>
          <Button type="button" variant={viewport === 'mobile' ? 'secondary' : 'ghost'} size="icon" aria-label="عرض الهاتف" onClick={() => setViewport('mobile')}><Smartphone /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="إعادة تحميل المعاينة" onClick={reload}><RefreshCw /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="ملء الشاشة" onClick={fullscreen}><Maximize2 /></Button>
        </div>
      </div>
      <div className={`portal-live-preview__canvas is-${viewport}`}>
        {(!nonce || previewGate || state !== 'ready') && <div className={`portal-live-preview__state${nonce && !previewGate && state === 'loading' ? ' is-skeleton' : ''}`} role="status">{!nonce ? <>تعذر إنشاء جلسة معاينة آمنة <Button type="button" variant="outline" size="sm" onClick={reload}>إعادة المحاولة</Button></> : previewGate?.state === 'loading' ? <>جاري تحميل بيانات الشارة الكاملة للمعاينة…</> : previewGate?.state === 'error' ? <>تعذر تحميل بيانات الشارة الكاملة <Button type="button" variant="outline" size="sm" onClick={previewGate.onRetry}>إعادة المحاولة</Button></> : state === 'error' ? <>تعذر تحميل المعاينة <Button type="button" variant="outline" size="sm" onClick={reload}>إعادة المحاولة</Button></> : <><span className="sr-only">جاري تجهيز المعاينة الخاصة</span><span className="portal-live-preview__skeleton-line is-title"/><span className="portal-live-preview__skeleton-line"/><span className="portal-live-preview__skeleton-line is-short"/><span className="portal-live-preview__skeleton-block"/></>}</div>}
        <iframe key={reloadKey} ref={iframeRef} src={iframeUrl || 'about:blank'} title={`معاينة ${surfaceLabel} الخاصة`} onError={() => setState('error')} />
      </div>
    </div>
  </section>;
}
