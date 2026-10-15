export function appUploadRoute(category = 'app') {
  const normalized = category.trim();
  return `/uploads/${normalized || 'app'}`;
}
