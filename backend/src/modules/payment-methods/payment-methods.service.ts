import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface PaymentMethodRow {
  id: number;
  name: string;
  number: string;
  username: string | null;
  image: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CreatePaymentMethodDto {
  name: string;
  number: string;
  username?: string | null;
  image?: string | null;
  isActive?: boolean;
}

export interface UpdatePaymentMethodDto {
  name?: string;
  number?: string;
  username?: string | null;
  image?: string | null;
  isActive?: boolean;
}

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: any): PaymentMethodRow {
    return {
      id: Number(row.id),
      name: String(row.name),
      number: String(row.number),
      username: row.username ? String(row.username) : null,
      image: row.image ? String(row.image) : null,
      isActive: Boolean(row.is_active ?? row.isActive),
      createdAt: row.created_at ?? row.createdAt ?? new Date(),
    };
  }

  async findAll(): Promise<PaymentMethodRow[]> {
    try {
      const model = (this.prisma as any).settings_payment_methods;
      if (model && typeof model.findMany === 'function') {
        const rows = await model.findMany({ orderBy: { id: 'asc' } });
        return rows.map((r: any) => this.map(r));
      }
    } catch {
      // Fallback to raw SQL below
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      'SELECT id, name, number, username, image, is_active, created_at, updated_at FROM settings_payment_methods ORDER BY id ASC',
    );
    return rows.map((r) => this.map(r));
  }

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethodRow> {
    const isActive = dto.isActive !== false;
    const username = dto.username?.trim() || null;
    const image = dto.image?.trim() || null;

    try {
      const model = (this.prisma as any).settings_payment_methods;
      if (model && typeof model.create === 'function') {
        const row = await model.create({
          data: {
            name: dto.name,
            number: dto.number,
            username,
            image,
            is_active: isActive,
          },
        });
        return this.map(row);
      }
    } catch {
      // Fallback to raw SQL below
    }

    await this.prisma.$executeRawUnsafe(
      'INSERT INTO settings_payment_methods (name, number, username, image, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      dto.name,
      dto.number,
      username,
      image,
      isActive ? 1 : 0,
    );

    const created = await this.prisma.$queryRawUnsafe<any[]>(
      'SELECT * FROM settings_payment_methods ORDER BY id DESC LIMIT 1',
    );
    return this.map(created[0]);
  }

  async update(id: number, dto: UpdatePaymentMethodDto): Promise<PaymentMethodRow> {
    const username = dto.username !== undefined ? (dto.username?.trim() || null) : undefined;
    const image = dto.image !== undefined ? (dto.image?.trim() || null) : undefined;

    try {
      const model = (this.prisma as any).settings_payment_methods;
      if (model && typeof model.update === 'function') {
        const row = await model.update({
          where: { id },
          data: {
            ...(dto.name != null && { name: dto.name }),
            ...(dto.number != null && { number: dto.number }),
            ...(username !== undefined && { username }),
            ...(image !== undefined && { image }),
            ...(dto.isActive !== undefined && { is_active: dto.isActive }),
          },
        });
        return this.map(row);
      }
    } catch {
      // Fallback to raw SQL below
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (dto.name != null) {
      updates.push('name = ?');
      params.push(dto.name);
    }
    if (dto.number != null) {
      updates.push('number = ?');
      params.push(dto.number);
    }
    if (username !== undefined) {
      updates.push('username = ?');
      params.push(username);
    }
    if (image !== undefined) {
      updates.push('image = ?');
      params.push(image);
    }
    if (dto.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(dto.isActive ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(id);
      await this.prisma.$executeRawUnsafe(
        `UPDATE settings_payment_methods SET ${updates.join(', ')} WHERE id = ?`,
        ...params,
      );
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      'SELECT * FROM settings_payment_methods WHERE id = ? LIMIT 1',
      id,
    );
    if (!rows || rows.length === 0) throw new NotFoundException('طريقة الدفع غير موجودة');
    return this.map(rows[0]);
  }

  async remove(id: number): Promise<{ id: number }> {
    try {
      const model = (this.prisma as any).settings_payment_methods;
      if (model && typeof model.delete === 'function') {
        await model.delete({ where: { id } });
        return { id };
      }
    } catch {
      // Fallback to raw SQL below
    }

    await this.prisma.$executeRawUnsafe('DELETE FROM settings_payment_methods WHERE id = ?', id);
    return { id };
  }
}
