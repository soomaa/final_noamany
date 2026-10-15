import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { RequiresPermission } from '../common/decorators/requires-permission.decorator';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Read-only compatibility endpoint used by the employee profile.
 *
 * Portable account lifecycle is intentionally owned by Employees/UserAdmin,
 * which update the canonical users identity and its sessions. The legacy
 * api_users CRUD surface is not part of the portable reference.
 */
@Controller('app-users')
@RequiresPermission('admin.app-users:view')
export class PortableAppUserController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const row = await this.prisma.api_users.findUnique({
      where: { user_id: id },
    });
    if (!row) throw new NotFoundException('المستخدم غير موجود');
    return {
      id: row.user_id,
      name: row.user_name,
      phone: row.user_phone,
      email: row.user_email,
      city: row.user_city,
      status: row.status,
      image: row.m_image,
    };
  }
}
