import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateAgentDto, ListAgentsDto, UpdateAgentDto } from './dto/agents.dto';

/**
 * Build a URL-friendly slug from the agent name (legacy Agents.php stored a
 * `name_slug` alongside the name). We lowercase, collapse whitespace to single
 * dashes and drop characters that aren't word chars/Arabic/dashes — Arabic is
 * preserved so RTL names still produce a meaningful slug.
 */
function toNameSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListAgentsDto) {
    const and: Prisma.tbl_agentsWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { name: { contains: s } },
          { mob: { contains: s } },
          { email: { contains: s } },
          { office_no: { contains: s } },
        ],
      });
    }
    // ListQueryDto-style `status` maps to activity, but a dedicated `activity`
    // field is also accepted (both end up filtering tbl_agents.activity).
    if (q.activity) and.push({ activity: q.activity });

    const where: Prisma.tbl_agentsWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.tbl_agents.findMany({
        where,
        orderBy: { agent_id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_agents.count({ where }),
    ]);

    const data = rows.map((row) => ({
      id: row.agent_id,
      name: row.name,
      image: row.image,
      mob: row.mob,
      email: row.email,
      officeNo: row.office_no,
      activity: row.activity,
      createdAt: row.created,
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: number) {
    const row = await this.findOrThrow(id);
    return {
      id: row.agent_id,
      name: row.name,
      nameSlug: row.name_slug,
      gender: row.gender,
      image: row.image,
      officeNo: row.office_no,
      mob: row.mob,
      mob2: row.mob_2,
      mob3: row.mob_3,
      mob4: row.mob_4,
      fax: row.fax,
      email: row.email,
      privateEmail: row.private_email,
      facebook: row.facebook,
      twitter: row.twitter,
      instgram: row.instgram,
      linkedin: row.linkedin,
      address: row.address,
      description: row.description,
      activity: row.activity,
      viewDetails: row.view_details,
      haveAccount: row.have_account,
      createdAt: row.created,
      updatedAt: row.updated,
    };
  }

  async create(dto: CreateAgentDto) {
    const row = await this.prisma.tbl_agents.create({
      data: {
        name: dto.name,
        name_slug: toNameSlug(dto.name),
        gender: dto.gender ?? null,
        image: dto.image ?? null,
        office_no: dto.officeNo ?? null,
        mob: dto.mob ?? null,
        mob_2: dto.mob2 ?? null,
        mob_3: dto.mob3 ?? null,
        mob_4: dto.mob4 ?? null,
        fax: dto.fax ?? null,
        email: dto.email ?? null,
        private_email: dto.privateEmail ?? null,
        facebook: dto.facebook ?? null,
        twitter: dto.twitter ?? null,
        instgram: dto.instgram ?? null,
        linkedin: dto.linkedin ?? null,
        address: dto.address ?? null,
        description: dto.description ?? null,
        activity: dto.activity ?? 'active',
        view_details: dto.viewDetails ?? 'no',
        created: new Date(),
      },
    });
    return { id: row.agent_id };
  }

  async update(id: number, dto: UpdateAgentDto) {
    await this.findOrThrow(id);
    await this.prisma.tbl_agents.update({
      where: { agent_id: id },
      data: {
        ...(dto.name != null ? { name: dto.name, name_slug: toNameSlug(dto.name) } : {}),
        ...(dto.gender != null ? { gender: dto.gender } : {}),
        ...(dto.image != null ? { image: dto.image } : {}),
        ...(dto.officeNo != null ? { office_no: dto.officeNo } : {}),
        ...(dto.mob != null ? { mob: dto.mob } : {}),
        ...(dto.mob2 != null ? { mob_2: dto.mob2 } : {}),
        ...(dto.mob3 != null ? { mob_3: dto.mob3 } : {}),
        ...(dto.mob4 != null ? { mob_4: dto.mob4 } : {}),
        ...(dto.fax != null ? { fax: dto.fax } : {}),
        ...(dto.email != null ? { email: dto.email } : {}),
        ...(dto.privateEmail != null ? { private_email: dto.privateEmail } : {}),
        ...(dto.facebook != null ? { facebook: dto.facebook } : {}),
        ...(dto.twitter != null ? { twitter: dto.twitter } : {}),
        ...(dto.instgram != null ? { instgram: dto.instgram } : {}),
        ...(dto.linkedin != null ? { linkedin: dto.linkedin } : {}),
        ...(dto.address != null ? { address: dto.address } : {}),
        ...(dto.description != null ? { description: dto.description } : {}),
        ...(dto.activity != null ? { activity: dto.activity } : {}),
        ...(dto.viewDetails != null ? { view_details: dto.viewDetails } : {}),
        updated: new Date(),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.tbl_agents.delete({ where: { agent_id: id } });
    return { id };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.tbl_agents.findUnique({ where: { agent_id: id } });
    if (!row) throw new NotFoundException('الوكيل غير موجود');
    return row;
  }
}
