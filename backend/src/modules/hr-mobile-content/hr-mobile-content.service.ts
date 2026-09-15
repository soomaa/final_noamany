import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateHrMobileContentDto } from './dto/hr-mobile-content.dto';

@Injectable()
export class HrMobileContentService {
  constructor(private readonly prisma: PrismaService) {}

  async about() {
    const row = await this.content();
    return { title: row.about_title, body: row.about_body, updatedAt: row.updated_at.toISOString() };
  }

  async privacy() {
    const row = await this.content();
    return { title: row.privacy_title, body: row.privacy_body, updatedAt: row.updated_at.toISOString() };
  }

  async get() {
    const row = await this.content();
    return this.map(row);
  }

  async update(dto: UpdateHrMobileContentDto) {
    const current = await this.content();
    const row = await this.prisma.hr_mobile_app_content.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        about_title: dto.aboutTitle ?? current.about_title,
        about_body: dto.aboutBody ?? current.about_body,
        privacy_title: dto.privacyTitle ?? current.privacy_title,
        privacy_body: dto.privacyBody ?? current.privacy_body,
      },
      update: {
        ...(dto.aboutTitle !== undefined ? { about_title: dto.aboutTitle } : {}),
        ...(dto.aboutBody !== undefined ? { about_body: dto.aboutBody } : {}),
        ...(dto.privacyTitle !== undefined ? { privacy_title: dto.privacyTitle } : {}),
        ...(dto.privacyBody !== undefined ? { privacy_body: dto.privacyBody } : {}),
      },
    });
    return this.map(row);
  }

  private async content() {
    const existing = await this.prisma.hr_mobile_app_content.findUnique({ where: { id: 1 } });
    if (existing) return existing;
    return this.prisma.hr_mobile_app_content.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
  }

  private map(row: { about_title: string; about_body: string; privacy_title: string; privacy_body: string; updated_at: Date }) {
    return {
      about: { title: row.about_title, body: row.about_body },
      privacy: { title: row.privacy_title, body: row.privacy_body },
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
