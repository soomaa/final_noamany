import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { BranchesService } from './branches.service';

@UseGuards(JwtAuthGuard)
@Controller('branch-options')
export class BranchOptionsController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  findOptions(@CurrentUser() user: JwtUser) {
    return this.branches.findOptions(user);
  }
}
