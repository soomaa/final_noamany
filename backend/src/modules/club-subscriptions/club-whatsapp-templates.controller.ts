import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClubWhatsAppTemplatesService } from './club-whatsapp-templates.service';

/** «قوالب واتساب» under إدارة الاشتراكات. */
@UseGuards(JwtAuthGuard)
@Controller('club-whatsapp-templates')
export class ClubWhatsAppTemplatesController {
  constructor(private readonly templates: ClubWhatsAppTemplatesService) {}

  /** Read by every screen that sends a WhatsApp message (reception, subscriptions, expiring list). */
  @Get()
  get() {
    return this.templates.get();
  }

  @Patch()
  @RequiresPermission('club.subscriptions.whatsapp_templates:update', 'club.packages.settings:update', 'club.subscriptions:configure')
  update(@Body() body: unknown, @CurrentUser('sub') userId: number) {
    return this.templates.update(body, userId);
  }
}
