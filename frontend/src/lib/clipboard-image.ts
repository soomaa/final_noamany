export interface ClipboardImageItemConstructor<T> {
  new (items: Record<string, Blob | PromiseLike<Blob>>): T;
}

export interface ClipboardImageWriter<T> {
  write(items: T[]): Promise<void>;
}

/** Writes an image blob to the system clipboard. */
export async function writePngImageToClipboard<T>(
  png: Blob | PromiseLike<Blob>,
  clipboard: ClipboardImageWriter<T>,
  ClipboardItemType: ClipboardImageItemConstructor<T>,
): Promise<void> {
  await clipboard.write([new ClipboardItemType({ 'image/png': png })]);
}
