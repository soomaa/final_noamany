import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMemberDocumentFormData,
  memberDocumentDownloadUrl,
} from './member-document-model.ts';

test('builds one protected multipart upload without client-owned storage metadata', () => {
  const file = new File([Buffer.from('%PDF-1.7\n')], 'بطاقة.pdf', { type: 'application/pdf' });
  const body = buildMemberDocumentFormData(file, 'national_id', 'وجه البطاقة');

  assert.equal(body.get('file'), file);
  assert.equal(body.get('type'), 'national_id');
  assert.equal(body.get('label'), 'وجه البطاقة');
  assert.deepEqual([...body.keys()].sort(), ['file', 'label', 'type']);
});

test('uses the authenticated API blob route rather than a public uploads path', () => {
  assert.equal(
    memberDocumentDownloadUrl(4, 8),
    '/club-members/4/membership-documents/8/file',
  );
});
