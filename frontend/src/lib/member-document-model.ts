export function buildMemberDocumentFormData(file: File, type: string, label: string) {
  const body = new FormData();
  body.append('file', file);
  body.append('type', type);
  body.append('label', label.trim() || file.name);
  return body;
}

export function memberDocumentDownloadUrl(memberId: number, documentId: number) {
  return `/club-members/${memberId}/membership-documents/${documentId}/file`;
}
