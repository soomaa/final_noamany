import { Module } from '@nestjs/common';
import { CafeDashboardController } from './cafe-dashboard.controller';
import { CafeDashboardService } from './cafe-dashboard.service';
@Module({ controllers: [CafeDashboardController], providers: [CafeDashboardService] })
export class CafeDashboardModule {}

