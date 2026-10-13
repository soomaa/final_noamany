import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Req, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PortalCustomerClaims, PortalCustomerGuard } from './portal-customer.guard';
import { PublicPortalService } from './public-portal.service';

type CustomerRequest = Request & { user: PortalCustomerClaims };

@Public()
@Controller('public/portal')
export class PublicPortalController {
  constructor(private readonly service: PublicPortalService) {}

  @Get('home') home() { return this.service.home(); }
  @Get('products') products() { return this.service.products(); }
  @Get('products/:id') product(@Param('id', ParseIntPipe) id: number) { return this.service.product(id); }
  @Get('jobs') jobs() { return this.service.jobs(); }
  @Get('membership-plans') membershipPlans() { return this.service.membershipPlans(); }
  @Get('payment-methods') paymentMethods() { return this.service.paymentMethods(); }

  @Post('online-subscription-options')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  onlineSubscriptionOptions(@Body() body: Record<string, unknown>) {
    return this.service.onlineSubscriptionOptions(body);
  }

  @Post('online-subscriptions')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('paymentProof', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12 } }))
  onlineSubscription(
    @Body() body: Record<string, unknown>,
    @UploadedFile() paymentProof?: Express.Multer.File,
  ) { return this.service.createOnlineSubscriptionRequest(body, paymentProof); }

  @Post('job-applications')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'cv', maxCount: 1 },
    { name: 'personalImage', maxCount: 1 },
  ], { limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 30 } }))
  jobApplication(
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: { cv?: Express.Multer.File[]; personalImage?: Express.Multer.File[] },
  ) { return this.service.jobApplication(body, files); }

  @Post('contact')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  contact(@Body() body: Record<string, unknown>) { return this.service.contact(body); }

  @Post('membership-leads')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  lead(@Body() body: Record<string, unknown>) { return this.service.membershipLead(body); }

  @Post('coupons/validate')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  coupon(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) { return this.service.validateCoupon(body, authorization); }
  @Post('orders')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('paymentProof', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 30 } }))
  order(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
    @UploadedFile() paymentProof?: Express.Multer.File,
  ) { return this.service.createOrder(body, authorization, paymentProof); }

  @Post('auth/register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() body: Record<string, unknown>) { return this.service.register(body); }

  @Post('auth/login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() body: Record<string, unknown>) { return this.service.login(body); }

  @UseGuards(PortalCustomerGuard)
  @Get('account') account(@Req() request: CustomerRequest) { return this.service.account(request.user.sub); }

  @UseGuards(PortalCustomerGuard)
  @Get('account/orders') accountOrders(@Req() request: CustomerRequest) { return this.service.accountOrders(request.user.sub); }

  @UseGuards(PortalCustomerGuard)
  @Get('account/orders/:id') accountOrder(
    @Req() request: CustomerRequest,
    @Param('id', ParseIntPipe) id: number,
  ) { return this.service.accountOrder(request.user.sub, id); }
}
