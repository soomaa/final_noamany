import { CanActivate, GoneException, Injectable } from '@nestjs/common';

/** Keeps retired features unavailable without deleting their historical tables. */
@Injectable()
export class RetiredClubFeatureGuard implements CanActivate {
  canActivate(): boolean {
    throw new GoneException('هذه الميزة أُوقفت؛ السجلات التاريخية محفوظة للرجوع الإداري');
  }
}
