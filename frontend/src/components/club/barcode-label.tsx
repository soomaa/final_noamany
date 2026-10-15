import { code128Svg } from '@/lib/code128';
import { cn } from '@/lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';

export type MemberCodeFormat = 'qr' | 'barcode';

export interface BarcodeLabelData {
  format?: MemberCodeFormat;
  /** Human-readable member reference; never the gate payload. */
  code: string;
  scannerCode: string | null;
  name: string;
  /** Optional branch name shown under the label. */
  branch?: string | null;
}

interface BarcodeLabelProps extends BarcodeLabelData {
  className?: string;
  unavailableLabel: string;
}

interface BarcodePreviewProps {
  format?: MemberCodeFormat;
  code: string;
  scannerCode: string | null;
  className?: string;
  size?: number;
  unavailableLabel: string;
  /** Show the human-readable member code below the QR. */
  showCode?: boolean;
}

/** C3 reports decimal card values, so credentials must survive that round-trip. */
export function isGateQrCredential(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,7}$/.test(value) && Number(value) <= 16_777_215;
}

function gateQrSvg(scannerCode: string | null, size: number): string {
  if (!isGateQrCredential(scannerCode)) throw new Error('Unsupported gate QR credential');
  return renderToStaticMarkup(
    <QRCodeSVG value={scannerCode} size={size} level="M" marginSize={4}
      bgColor="#FFFFFF" fgColor="#000000" title="QR" xmlns="http://www.w3.org/2000/svg" />,
  );
}

/** Square QR with a four-module white quiet zone, including in dark mode. */
export function BarcodePreview({ code, scannerCode, className, size = 148, showCode = true, unavailableLabel, format = 'qr' }: BarcodePreviewProps) {
  const svg = format === 'barcode' ? code128Svg(code, { height: 64 })
    : isGateQrCredential(scannerCode) ? gateQrSvg(scannerCode, size) : null;

  return (
    <div className={cn('flex w-full flex-col items-center gap-1', className)}>
      {svg ? (
        <div className="flex w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }} />
      ) : <p className="p-3 text-center text-sm">{unavailableLabel}</p>}
      {showCode && (
        <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-muted-foreground" dir="ltr">
          {code}
        </span>
      )}
    </div>
  );
}

/** Brand shown on every label. Kept in one place so print + screen stay in sync. */
const BRAND = 'ONE80 Gym';

/** Printable member QR label using the same gate credential as the member app. */
export function BarcodeLabel({ code, scannerCode, name, branch, className, unavailableLabel, format = 'qr' }: BarcodeLabelProps) {

  return (
    <div
      className={cn(
        'flex w-72 max-w-full flex-col items-center gap-2 rounded-xl border bg-white px-5 py-4 text-black shadow-sm print:border print:shadow-none',
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">{BRAND}</p>
      <p className="w-full truncate text-center text-base font-bold" title={name}>
        {name}
      </p>
      <BarcodePreview format={format} code={code} scannerCode={scannerCode} size={180} showCode={false} unavailableLabel={unavailableLabel} />
      <p className="font-mono text-xl font-bold tracking-[0.15em]" dir="ltr">
        {code}
      </p>
      {branch && <p className="text-[11px] text-gray-500">{branch}</p>}
    </div>
  );
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
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
      reject(new Error('Could not render the QR image'));
    };
    image.src = url;
  });
}

/** Renders the complete visible ONE80 member label as a high-resolution PNG. */
export async function barcodeLabelPng({ code, scannerCode, name, branch, format = 'qr' }: BarcodeLabelData): Promise<Blob> {
  const isQr = format === 'qr';
  const svg = isQr ? gateQrSvg(scannerCode, 464) : code128Svg(code, { moduleWidth: 3, height: 180 });
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = isQr ? (branch ? 840 : 784) : (branch ? 600 : 548);
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
  context.fillText('O N E 8 0   G Y M', canvas.width / 2, 66);

  context.fillStyle = '#050505';
  context.font = '700 42px Tajawal, system-ui, sans-serif';
  context.fillText(fitText(context, name, 620), canvas.width / 2, 132);

  const qr = await svgImage(svg);
  // 464px is an integer 16x scale of the 29-module QR (including quiet zone).
  context.imageSmoothingEnabled = false;
  const imageWidth = isQr ? 464 : Math.min(620, qr.naturalWidth);
  const imageHeight = isQr ? 464 : qr.naturalHeight / qr.naturalWidth * imageWidth;
  context.drawImage(qr, (canvas.width - imageWidth) / 2, 184, imageWidth, imageHeight);

  context.fillStyle = '#050505';
  context.font = '700 54px ui-monospace, Menlo, Consolas, monospace';
  context.direction = 'ltr';
  context.fillText(fitText(context, code, 620), canvas.width / 2, isQr ? 708 : 454);

  if (branch) {
    context.fillStyle = '#6b7280';
    context.font = '400 28px Tajawal, system-ui, sans-serif';
    context.direction = 'rtl';
    context.fillText(fitText(context, branch, 620), canvas.width / 2, isQr ? 778 : 524);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create the QR PNG'));
    }, 'image/png');
  });
}

/** Standalone HTML (inline styles only) for one label, used inside the print iframe. */
export function labelPrintHtml({ code, scannerCode, name, branch, format = 'qr' }: BarcodeLabelData): string {
  const svg = format === 'barcode' ? code128Svg(code, { height: 90 }) : gateQrSvg(scannerCode, 180);
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div class="label">
      <div class="brand">${esc(BRAND)}</div>
      <div class="name">${esc(name)}</div>
      <div class="qr">${svg}</div>
      <div class="code">${esc(code)}</div>
      ${branch ? `<div class="branch">${esc(branch)}</div>` : ''}
    </div>`;
}

/**
 * Print one or more QR labels in an isolated hidden iframe.
 *
 * This avoids the "blank page" problem caused by `window.print()` printing the
 * whole app: only the labels are sent to the printer, each centred on its page.
 */
export function printBarcodeLabels(labels: BarcodeLabelData[]): void {
  if (!labels.length) return;
  const labelsHtml = labels.map(labelPrintHtml).join('');

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
    .qr { display: flex; justify-content: center; margin: 4px 0; }
    .qr svg { width: 42mm; height: 42mm; max-width: 100%; }
    .code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 18px; font-weight: 700; letter-spacing: 2px; }
    .branch { margin-top: 3px; font-size: 10px; color: #6b7280; }
    @media print { .label { margin: 0 auto 4mm; } }
    @page { margin: 8mm; }
  `;

  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Member QR</title><style>${styles}</style></head>` +
      `<body>${labelsHtml}</body></html>`,
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
