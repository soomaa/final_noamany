import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { MemberJwtAuthGuard } from '../member/guards/member-jwt-auth.guard';
import { TrainerTrainingGuard } from './trainer-training.guard';
import { TrainingRecordingsService } from './training-recordings.service';
import { TrainingService } from './training.service';
import { recordingView } from './recording-media';

const upload = FileInterceptor('file', { limits: { fileSize: 21 * 1024 * 1024, files: 1 } });

@Controller('club-training')
@RequiresPermission('club.fitness.training_space:view')
export class TrainingRecordingsAdminController {
  constructor(private readonly recordings: TrainingRecordingsService) {}
  @Get('members/:memberId/recordings')
  list(@Param('memberId', ParseIntPipe) memberId: number, @CurrentUser() user: JwtUser) {
    return this.recordings.list(memberId, user);
  }
  @Post('members/:memberId/recordings')
  @RequiresPermission('club.fitness.training_space:update')
  @UseInterceptors(upload)
  create(@Param('memberId', ParseIntPipe) memberId: number, @UploadedFile() file: Express.Multer.File, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.recordings.create(memberId, body, file, user);
  }
  @Delete('members/:memberId/recordings/:id')
  @RequiresPermission('club.fitness.training_space:delete')
  remove(@Param('memberId', ParseIntPipe) memberId: number, @Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.recordings.remove(memberId, id, user);
  }
}

@Controller(["trainer-portal/training", "mobile/trainer/training"])
@UseGuards(TrainerTrainingGuard)
export class TrainerRecordingsController {
  constructor(private readonly recordings: TrainingRecordingsService) {}
  @Get('members/:memberId/recordings')
  list(@Param('memberId', ParseIntPipe) memberId: number, @CurrentUser() user: JwtUser) {
    return this.recordings.list(memberId, user);
  }
  @Post('members/:memberId/recordings')
  @UseInterceptors(upload)
  create(@Param('memberId', ParseIntPipe) memberId: number, @UploadedFile() file: Express.Multer.File, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.recordings.create(memberId, body, file, user);
  }
  @Delete('members/:memberId/recordings/:id')
  remove(@Param('memberId', ParseIntPipe) memberId: number, @Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.recordings.remove(memberId, id, user);
  }
}

@Public()
@UseGuards(MemberJwtAuthGuard)
@Controller('member/training')
export class MemberRecordingsController {
  constructor(private readonly training: TrainingService) {}
  /** The member's recordings for the current program (also embedded in GET /member/training). */
  @Get('recordings')
  async list(@CurrentMember() user: MemberJwtUser) {
    return (await this.training.recordingsFor(user.memberId, user)).map((row) => recordingView(row));
  }
}

/** QR code / WhatsApp link. The token is unguessable and the link dies at expiry. */
@Public()
@Controller('public/training-recordings')
export class PublicRecordingsController {
  constructor(private readonly recordings: TrainingRecordingsService) {}
  @Get(':token')
  async file(@Param('token') token: string, @Res() res: Response) {
    const file = await this.recordings.shared(token);
    res.type(file.mime);
    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      'Content-Disposition': 'inline',
    });
    res.sendFile(file.path, { dotfiles: 'deny' });
  }
}
