import { Test } from '@nestjs/testing';
import { One80ExternalIdentityAdapter } from './identity/one80-external-identity.adapter';
import { AppModule } from '../../app.module';

describe('One80AdaptersModule', () => {
  it('constructs the external identity adapter when the application graph boots', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(One80ExternalIdentityAdapter)).toBeInstanceOf(One80ExternalIdentityAdapter);
    await moduleRef.close();
  });
});
