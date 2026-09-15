export async function openProtectedProof(load: () => Promise<Blob>, browser: Window = window) {
  // Reserve the tab while the click still has browser user activation.
  const preview = browser.open('about:blank', '_blank');
  if (!preview) throw new Error('تعذّر فتح الإثبات. اسمح بالنوافذ المنبثقة لهذا الموقع ثم حاول مجددًا.');
  preview.opener = null;
  let url: string | undefined;
  try {
    const blob = await load();
    url = URL.createObjectURL(blob);
    preview.location.replace(url);
    browser.setTimeout(() => URL.revokeObjectURL(url!), 60_000);
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    preview.close();
    throw error;
  }
}
