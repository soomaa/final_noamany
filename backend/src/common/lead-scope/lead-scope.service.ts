import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { employeeIdForLogin, isSalesEmployeeId } from '../../modules/employees/sales-attribution.util';
import type { JwtUser } from '../types/jwt-user';
import { leadScopeFor, leadScopeWhere } from './lead-scope';

/**
 * One answer to "whose leads may this caller see", for every screen that shows leads.
 *
 * A sales rep sees their own pipeline and nothing else — not in the list, not in the
 * header search, not in the membership screen's type-ahead, and not by opening an id
 * directly. Each of those was its own query with its own idea of scoping, which is how a
 * rep ended up able to find a colleague's customer through the search box while the list
 * correctly hid it.
 */
@Injectable()
export class LeadScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async scopeFor(user: JwtUser | null | undefined) {
    if (!user) return leadScopeFor(false, null);
    const isRep = await isSalesEmployeeId(this.prisma, user.emp_code).catch(() => false);
    if (!isRep) return leadScopeFor(false, null);
    const employeeId = await employeeIdForLogin(this.prisma, user.emp_code).catch(() => null);
    return leadScopeFor(true, employeeId);
  }

  /** Prisma `where` fragment: `{}` for a supervisor, `{ assigned_to: n }` for a rep. */
  async whereFor(user: JwtUser | null | undefined): Promise<Record<string, unknown>> {
    return leadScopeWhere(await this.scopeFor(user));
  }
}

@Global()
@Module({ providers: [LeadScopeService], exports: [LeadScopeService] })
export class LeadScopeModule {}
