import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { UpdateHrMobileContentDto } from './dto/hr-mobile-content.dto';
import { HrMobileContentService } from './hr-mobile-content.service';

/** HR management pages — independent from the general system/app-management module. */
@UseGuards(JwtAuthGuard)
@Controller('hr/mobile-content')
@RequiresPermission('hr.mobile-content:view')
export class HrMobileContentController {
  constructor(private readonly content: HrMobileContentService) {}

  @Get()
  get() {
    return this.content.get();
  }

  @Put()
  @RequiresPermission('hr.mobile-content:update')
  update(@Body() dto: UpdateHrMobileContentDto) {
    return this.content.update(dto);
  }
}

/** Read-only HR employee-app pages. JWT keeps their HR text out of the public member app. */
@UseGuards(JwtAuthGuard)
@Controller('mobile/content')
export class MobileHrContentController {
  constructor(private readonly content: HrMobileContentService) {}

  @Get('about')
  about() {
    return this.content.about();
  }

  @Get('privacy-policy')
  privacy() {
    return this.content.privacy();
  }
}
