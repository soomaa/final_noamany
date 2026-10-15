import { Test } from '@nestjs/testing';
import { PrismaService } from '../common/prisma/prisma.service';
import { PermissionEngineService } from '../modules/rbac/engine/permission-engine.service';
import { PortableHrModule } from './portable-hr.module';

describe('Portable HR composition root', () => {
  it('resolves mandatory security and RBAC providers without a host module', async () => {
    const module = await Test.createTestingModule({ imports: [PortableHrModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    expect(module.get(PermissionEngineService)).toBeInstanceOf(PermissionEngineService);
    await module.close();
  });
});
