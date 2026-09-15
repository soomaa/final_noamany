import { cn } from '@/lib/utils';
import { code128Svg } from '@/lib/code128';

export interface BarcodeLabelData {
  code: string;
  name: string;
  /** Optional branch name shown under the label. */
  branch?: string | null;
}

interface BarcodeLabelProps extends BarcodeLabelData {
  className?: string;
}

interface BarcodePreviewProps {
  code: string;
  className?: string;
  /** Bar height in px — keep small for table rows, larger for cards. */
  height?: number;
  /** Show the human-readable code under the bars. */
  showCode?: boolean;
}

/** Compact scannable barcode for lists, tables, and card previews. */
export function BarcodePreview({ code, className, height = 52, showCode = true }: BarcodePreviewProps) {
  const svg = code128Svg(code, { moduleWidth: 1.6, height });

  return (
    <div className={cn('flex w-full flex-col items-center gap-1', className)}>
      <div
        className="flex w-full max-w-[220px] items-center justify-center [&_svg]:h-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {showCode && (
        <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-muted-foreground" dir="ltr">
          {code}
        </span>
      )}
    </div>
  );
}

/** Brand shown on every label. Kept in one place so print + screen stay in sync. */
const BRAND = 'Noamany Fitness Center';

/** Printable member barcode label — renders a real, scannable Code 128 barcode. */
export function BarcodeLabel({ code, name, branch, className }: BarcodeLabelProps) {
  const svg = code128Svg(code, { moduleWidth: 2, height: 84 });

  return (
    <div
      className={cn(
        'flex w-72 flex-col items-center gap-2 rounded-xl border bg-white px-5 py-4 text-black shadow-sm print:border print:shadow-none',
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">{BRAND}</p>
      <p className="w-full truncate text-center text-base font-bold" title={name}>
        {name}
      </p>
      <div
        className="flex w-full items-center justify-center"
        // Inline SVG is safe: generated locally from a fixed template, no user HTML.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="font-mono text-xl font-bold tracking-[0.15em]" dir="ltr">
        {code}
      </p>
      {branch && <p className="text-[11px] text-gray-500">{branch}</p>}
    </div>
  );
}

/** Standalone HTML (inline styles only) for one label, used inside the print iframe. */
function labelPrintHtml({ code, name, branch }: BarcodeLabelData): string {
  const svg = code128Svg(code, { moduleWidth: 2, height: 90 });
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div class="label">
      <div class="brand">${esc(BRAND)}</div>
      <div class="name">${esc(name)}</div>
      <div class="bars">${svg}</div>
      <div class="code">${esc(code)}</div>
      ${branch ? `<div class="branch">${esc(branch)}</div>` : ''}
    </div>`;
}

/**
 * Print one or more barcode labels in an isolated hidden iframe.
 *
 * This avoids the "blank page" problem caused by `window.print()` printing the
 * whole app: only the labels are sent to the printer, each centred on its page.
 */
export function printBarcodeLabels(labels: BarcodeLabelData[]): void {
  if (!labels.length) return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    .label {
      width: 62mm;
      margin: 6mm auto;
      padding: 4mm 4mm 5mm;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      text-align: center;
      page-break-inside: avoid;
      background: #fff;
      color: #000;
    }
    .brand { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #6b7280; }
    .name { margin: 4px 0; font-size: 15px; font-weight: 700; }
    .bars { display: flex; justify-content: center; margin: 4px 0; }
    .bars svg { max-width: 100%; height: auto; }
    .code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 18px; font-weight: 700; letter-spacing: 2px; }
    .branch { margin-top: 3px; font-size: 10px; color: #6b7280; }
    @media print { .label { margin: 0 auto 4mm; } }
    @page { margin: 8mm; }
  `;

  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Barcode</title><style>${styles}</style></head>` +
      `<body>${labels.map(labelPrintHtml).join('')}</body></html>`,
  );
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return;
  }

  const doPrint = () => {
    win.focus();
    win.print();
    // Give the print dialog time to grab the document before teardown.
    window.setTimeout(() => iframe.remove(), 1000);
  };

  // Wait for layout/fonts before printing so nothing prints blank.
  if (doc.readyState === 'complete') {
    window.setTimeout(doPrint, 50);
  } else {
    win.addEventListener('load', () => window.setTimeout(doPrint, 50));
  }
}
