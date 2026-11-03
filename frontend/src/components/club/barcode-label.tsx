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

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (context.measureText(value).width <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render the barcode image'));
    };
    image.src = url;
  });
}

/** Renders the complete member label (brand, name, barcode, code, branch) as a high-resolution PNG. */
export async function barcodeLabelPng({ code, name, branch }: BarcodeLabelData): Promise<Blob> {
  const svg = code128Svg(code, { moduleWidth: 3, height: 180 });
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = branch ? 600 : 548;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  roundedRect(context, 2, 2, canvas.width - 4, canvas.height - 4, 30);
  context.strokeStyle = '#d7d2c8';
  context.lineWidth = 4;
  context.stroke();
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.fillStyle = '#6b7280';
  context.font = '600 24px Tajawal, system-ui, sans-serif';
  context.fillText(BRAND.toUpperCase(), canvas.width / 2, 66);

  context.fillStyle = '#050505';
  context.font = '700 42px Tajawal, system-ui, sans-serif';
  context.fillText(fitText(context, name, 620), canvas.width / 2, 132);

  const barcode = await svgImage(svg);
  // Keep the bars sharp: the scanner needs crisp module edges.
  context.imageSmoothingEnabled = false;
  const imageWidth = Math.min(620, barcode.naturalWidth);
  const imageHeight = (barcode.naturalHeight / barcode.naturalWidth) * imageWidth;
  context.drawImage(barcode, (canvas.width - imageWidth) / 2, 184, imageWidth, imageHeight);

  context.fillStyle = '#050505';
  context.font = '700 54px ui-monospace, Menlo, Consolas, monospace';
  context.direction = 'ltr';
  context.fillText(fitText(context, code, 620), canvas.width / 2, 454);

  if (branch) {
    context.fillStyle = '#6b7280';
    context.font = '400 28px Tajawal, system-ui, sans-serif';
    context.direction = 'rtl';
    context.fillText(fitText(context, branch, 620), canvas.width / 2, 524);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create the barcode PNG'));
    }, 'image/png');
  });
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
