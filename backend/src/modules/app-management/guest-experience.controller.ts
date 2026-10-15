import {
  Body,
  Controller,
  Get,
  HttpCode,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import { CreateGuestLeadDto } from "./dto/guest-experience.dto";
import { GuestExperienceService } from "./guest-experience.service";

@Public()
@UseGuards(ThrottlerGuard)
@Controller("app")
export class GuestExperienceController {
  constructor(private readonly service: GuestExperienceService) {}

  @Get("branches")
  branches() {
    return this.service.activeBranches();
  }

  @Get("cafe/catalog")
  cafe(@Query("branchId", ParseIntPipe) branchId: number) {
    return this.service.cafeCatalogue(branchId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("guest-leads")
  lead(@Body() dto: CreateGuestLeadDto) {
    return this.service.createGuestLead(dto);
  }
}

/**
 * `guest/leads` — the PHAROS-shaped path of the same guest lead flow as `app/guest-leads`.
 * Both write through GuestExperienceService, so dedupe (one open lead per branch + phone)
 * and the branch check on the chosen program are identical whichever path the app uses.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller("guest/leads")
export class GuestLeadsController {
  constructor(private readonly service: GuestExperienceService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("programs")
  programs(@Query("branchId", ParseIntPipe) branchId: number) {
    return this.service.listGuestInterestedPrograms(branchId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  async create(@Body() dto: CreateGuestLeadDto) {
    const result = await this.service.createGuestLead(dto);
    return { success: true as const, ...result };
  }
}
