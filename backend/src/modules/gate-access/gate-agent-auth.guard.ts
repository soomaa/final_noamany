import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GateAgentAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const controllerId = Number(request.params?.controllerId);
    if (!Number.isInteger(controllerId) || controllerId < 1) {
      throw new UnauthorizedException('Invalid gate controller');
    }

    const rawHeader = request.headers?.['x-gate-agent-token'];
    const token = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (typeof token !== 'string' || token.length < 32) {
      throw new UnauthorizedException('Missing gate agent token');
    }

    const controller = await this.prisma.gate_controllers.findUnique({
      where: { id: controllerId },
    });
    if (!controller) throw new UnauthorizedException('Unknown gate controller');
    if (!controller.is_active) throw new ForbiddenException('Gate controller is disabled');

    const supplied = Buffer.from(createHash('sha256').update(token).digest('hex'), 'hex');
    const expected = Buffer.from(controller.agent_token_hash, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException('Invalid gate agent token');
    }

    request.gateController = controller;
    return true;
  }
}
