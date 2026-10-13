import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../../../common/types/jwt-user';
import { PrismaService } from '../../../common/prisma/prisma.service';

function cookieExtractor(req: Request): string | null {
  if (req && req.cookies && req.cookies['one80_access']) {
    return req.cookies['one80_access'];
  }
  return null;
}

/** Accept the token aliases used by older Flutter network layers. */
function legacyMobileExtractor(req: Request): string | null {
  const body = req?.body as Record<string, unknown> | undefined;
  const query = req?.query as Record<string, unknown> | undefined;
  const value = body?.access_token ?? body?.token ?? query?.access_token ?? query?.token;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        legacyMobileExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  /** Whatever this returns becomes req.user. Reject member-app tokens on staff routes. */
  async validate(payload: JwtUser & { type?: string }): Promise<JwtUser> {
    if (payload.type === 'member') {
      throw new UnauthorizedException();
    }

    const store = this.prisma as any;
    const now = new Date();
    // A signed access token can remain valid for up to two hours. Resolve the
    // account's current level here so promoting a user to level 1 takes effect
    // immediately instead of leaving the account branch-scoped until re-login.
    const account = await store.users.findUnique({
      where: { user_id: payload.sub },
      select: { approved: true, level: true, emp_code: true },
    });
    if (!account || account.approved !== 1) {
      throw new UnauthorizedException();
    }
    const currentLevel = account.level ?? payload.level;
    const hasSuperAdminRole =
      currentLevel === 1 ||
      Boolean(
        await store.rbac_user_roles.findFirst({
          where: {
            user_id: payload.sub,
            OR: [{ expires_at: null }, { expires_at: { gt: now } }],
            role: { is_super_admin: true },
          },
          select: { id: true },
        }),
      );
    // Refresh the employee section too. This makes a change from men/women
    // to "all" (or the reverse) effective immediately, instead of waiting
    // for the signed access token to expire.
    let currentEmployeeType = payload.man_women_type;
    const employeeId = account.emp_code ?? payload.emp_code;
    if (!hasSuperAdminRole && employeeId != null) {
      const employee = await store.employees.findUnique({
        where: { id: employeeId },
        select: { emp_type: true },
      });
      if (employee?.emp_type != null) currentEmployeeType = employee.emp_type;
    }

    const user: JwtUser = {
      ...payload,
      level: currentLevel,
      man_women_type: currentEmployeeType,
      is_super_admin: hasSuperAdminRole,
    };

    if (user.is_super_admin || !user.branch) return user;
    const exceptions = await store.rbac_user_section_exceptions.findMany({
      where: { user_id: user.sub, branch_id: user.branch, OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      select: { section: true },
    });
    // employees.emp_type is 1 = men, 2 = women, 3 = both.  Keep 0 as men
    // for old sessions that predate the employee-form values.
    const defaultSections: Array<'male' | 'female'> = user.man_women_type === 3
      ? ['male', 'female']
      : user.man_women_type === 2
        ? ['female']
        : user.man_women_type === 1 || user.man_women_type === 0
          ? ['male']
          : [];
    user.member_sections = [...new Set([
      ...defaultSections,
      ...exceptions.map((row: { section: 'male' | 'female' }) => row.section),
    ])];
    return user;
  }
}
