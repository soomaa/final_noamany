import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  BadRequestException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RetiredClubFeatureGuard } from './retired-club-feature.guard';

@UseGuards(JwtAuthGuard, RetiredClubFeatureGuard)
@Controller('club-surveys')
@RequiresPermission('club.members:view')
export class ClubSurveysController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.club_surveys.findMany({ orderBy: { id: 'desc' } });
  }

  @Post()
  @RequiresPermission('club.members:create')
  create(@Body() body: { title: string; questions?: string[] }) {
    return this.prisma.club_surveys.create({
      data: {
        title: body.title,
        status: 'pending',
        questions_json: body.questions?.length ? body.questions : undefined,
      },
    });
  }

  @Put(':id')
  @RequiresPermission('club.members:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; status?: string; questions?: string[] },
  ) {
    return this.prisma.club_surveys.update({
      where: { id },
      data: {
        ...(body.title != null ? { title: body.title } : {}),
        ...(body.status != null ? { status: body.status } : {}),
        ...(body.questions != null ? { questions_json: body.questions } : {}),
      },
    });
  }

  @Post(':id/responses')
  @RequiresPermission('club.members:create')
  async submitResponse(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { memberId?: number; answers?: Prisma.InputJsonValue },
  ) {
    const survey = await this.prisma.club_surveys.findUnique({ where: { id } });
    if (!survey) throw new NotFoundException('الاستبيان غير موجود');
    if (survey.status !== 'active') {
      throw new BadRequestException('الاستبيان غير نشط');
    }
    return this.prisma.$transaction(async (tx) => {
      const response = await tx.club_survey_responses.create({
        data: {
          survey_id: id,
          member_id: body.memberId ?? null,
          answers_json: body.answers ?? undefined,
        },
      });
      await tx.club_surveys.update({
        where: { id },
        data: { responses_count: { increment: 1 } },
      });
      return response;
    });
  }

  @Delete(':id')
  @RequiresPermission('club.members:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.club_surveys.delete({ where: { id } });
  }
}
