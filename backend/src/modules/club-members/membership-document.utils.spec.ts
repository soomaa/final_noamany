import { normalizeMembershipDocumentType } from './membership-document.utils';

it('normalizes the client document type and rejects unknown categories', () => {
  expect(normalizeMembershipDocumentType('national-id')).toBe('national_id');
  expect(normalizeMembershipDocumentType('contract')).toBe('contract');
  expect(() => normalizeMembershipDocumentType('virus')).toThrow('نوع المستند');
});
