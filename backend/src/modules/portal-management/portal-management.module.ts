import { Module } from '@nestjs/common';
import { PortalManagementController } from './portal-management.controller';
import { PortalManagementService } from './portal-management.service';

@Module({ controllers: [PortalManagementController], providers: [PortalManagementService] })
export class PortalManagementModule {}
