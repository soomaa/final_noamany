import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { formatDate } from '@/lib/formatters';
import type { TrainingRecording } from './model';
import type { SheetRecordingQr } from './workout-sheet-model';

/** Newest playable recording per day, as a QR the printed sheet can embed. */
export function recordingQrByDay(recordings: TrainingRecording[] = []): Record<string, SheetRecordingQr> {
  const result: Record<string, SheetRecordingQr> = {};
  for (const item of [...recordings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!item.url || item.expired || result[item.dayId]) continue;
    const url = new URL(item.url, window.location.origin).href;
    result[item.dayId] = { svg: renderToStaticMarkup(<QRCodeSVG value={url} size={92} level="M" marginSize={0} />), until: formatDate(item.expiresAt), kind: item.kind };
  }
  return result;
}
