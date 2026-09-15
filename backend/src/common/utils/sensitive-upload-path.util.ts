export function sensitiveUploadMounts(publicUploadBase: string) {
  const base = `/${String(publicUploadBase || '/uploads').replace(/^\/+|\/+$/g, '')}`;
  return [
    `${base}/club/membership-documents`,
    `${base}/membership-documents`,
  ];
}
