import 'reflect-metadata';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import {
  PosInvoiceTemplatesController,
  PosSettingsController,
} from './pos-admin.controller';

describe('single invoice print read access', () => {
  it.each([PosInvoiceTemplatesController, PosSettingsController])(
    'lets today-invoice viewers load %p for local printing',
    (controller) => {
      const permissions = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller) as string[];
      expect(permissions).toContain('gym-sales.sales.drafts:view');
    },
  );
});
