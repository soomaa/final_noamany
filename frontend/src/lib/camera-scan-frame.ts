type BarcodeResult = { rawValue: string };

export type BarcodeDetectorFrame = {
  detect: (source: ImageBitmapSource) => Promise<BarcodeResult[]>;
};

export async function detectBarcodeFrame(
  detector: BarcodeDetectorFrame,
  source: ImageBitmapSource,
): Promise<{ code: string | null; error: unknown | null }> {
  try {
    const results = await detector.detect(source);
    return { code: results[0]?.rawValue?.trim() || null, error: null };
  } catch (error) {
    return { code: null, error };
  }
}

export function releaseLateCameraStream(
  stream: { getTracks: () => Array<{ stop: () => void }> },
  cancelled: boolean,
) {
  if (!cancelled) return false;
  for (const track of stream.getTracks()) track.stop();
  return true;
}
