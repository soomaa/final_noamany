import { GoneException } from '@nestjs/common';
import { RetiredClubFeatureGuard } from './retired-club-feature.guard';

describe('RetiredClubFeatureGuard', () => {
  it('returns 410 while historical group and survey tables remain untouched', () => {
    expect(() => new RetiredClubFeatureGuard().canActivate()).toThrow(GoneException);
  });
});
