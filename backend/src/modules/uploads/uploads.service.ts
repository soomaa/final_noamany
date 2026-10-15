import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { HrDataScopeService } from '../../common/hr-scope/hr-data-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import type { MemberJwtUser } from '../../common/types/member-jwt-user';
import { detectFileKind, FILE_KIND_METADATA, safeOriginalName } from './private-file.policy';
import {
  FILE_CATEGORY_ADAPTER,
  FileCategoryAdapter,
  HrFileCategoryAdapter,
} from '../../ports/files/file-category.adapter';

@Injectable()
export class UploadsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly hrScope: HrDataScopeService,
    private readonly branches: BranchScopeService,
    @Optional()
    @Inject(FILE_CATEGORY_ADAPTER)
    private readonly categories: FileCategoryAdapter = new HrFileCategoryAdapter(),
  ) {}

  async onModuleInit(): Promise<void> {
    // Provision the private root before the readiness probe starts accepting
    // traffic. Child category folders remain lazy and are always mode 0700.
    await mkdir(this.storageRoot(), { recursive: true, mode: 0o700 });
  }

  async store(
    category: string,
    file: Express.Multer.File,
    user: JwtUser,
    ownerEmployeeId?: number,
  ): Promise<{ id: string; path: string; filename: string; url: string }> {
    const policy = this.categories.policy(category);
    if (!policy) throw new BadRequestException('فئة الرفع غير صحيحة');
    if (!file?.buffer) throw new BadRequestException('لم يتم إرفاق ملف');
    if (file.buffer.length > policy.maxBytes) throw new BadRequestException('حجم الملف أكبر من المسموح');
    const kind = detectFileKind(file.buffer);
    if (!kind || !policy.allowedKinds.has(kind)) {
      throw new BadRequestException('محتوى الملف غير مدعوم');
    }
    if (ownerEmployeeId != null) await this.assertEmployeeAccess(user, ownerEmployeeId);

    const id = randomUUID();
    const metadata = FILE_KIND_METADATA[kind];
    const storageKey = `${category}/${id}.${metadata.extension}`;
    const absolutePath = this.absoluteStoragePath(storageKey);
    await mkdir(dirname(absolutePath), { recursive: true, mode: 0o700 });
    await writeFile(absolutePath, file.buffer, { flag: 'wx', mode: 0o600 });

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.private_file_metadata.create({
          data: {
            id,
            category,
            storage_key: storageKey,
            original_name: safeOriginalName(file.originalname),
            mime_type: metadata.mime,
            byte_size: BigInt(file.buffer.length),
            sha256: createHash('sha256').update(file.buffer).digest('hex'),
            owner_employee_id: ownerEmployeeId ?? null,
            branch_id: user.branch || null,
            uploaded_by: user.sub,
          },
        });
        await tx.business_audit_log.create({
          data: {
            entity_type: 'private_file',
            entity_id: id,
            action: 'file.uploaded',
            actor_user_id: user.sub,
            branch_id: user.branch || null,
            after_json: {
              category,
              ownerEmployeeId: ownerEmployeeId ?? null,
              byteSize: file.buffer.length,
            },
            changed_fields: ['created'],
          },
        });
      });
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }

    const publicMedia = policy.publicMedia === true;
    return {
      id,
      path: `${publicMedia ? 'public-file' : 'file'}:${id}`,
      filename: `${id}.${metadata.extension}`,
      url: `/api/uploads/${publicMedia ? 'public' : 'files'}/${id}`,
    };
  }

  /** Store a member's self-service avatar without granting staff upload privileges. */
  storeMemberProfile(
    file: Express.Multer.File,
    member: MemberJwtUser,
  ): Promise<{ id: string; path: string; filename: string; url: string }> {
    // The member-profile policy has no employee owner check. `store` only consumes
    // the authenticated actor id and branch for metadata/audit in this code path.
    return this.store('member-profile', file, {
      sub: member.sub,
      branch: member.branchId,
    } as JwtUser);
  }

  /** Internal compensation for a failed member-photo save, never a public delete route. */
  async discardMemberProfile(id: string, member: MemberJwtUser): Promise<void> {
    const row = await this.prisma.private_file_metadata.findFirst({
      where: { id, category: 'member-profile', uploaded_by: member.sub, deleted_at: null },
    });
    if (!row) return;
    await this.prisma.private_file_metadata.updateMany({
      where: { id, category: 'member-profile', uploaded_by: member.sub, deleted_at: null },
      data: { deleted_at: new Date(), deleted_by: member.sub },
    });
    await unlink(this.absoluteStoragePath(row.storage_key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  async openPublic(id: string) {
    const row = await this.prisma.private_file_metadata.findFirst({
      where: { id, deleted_at: null, validation_status: 'validated' },
    });
    if (!row || this.categories.policy(row.category)?.publicMedia !== true) {
      throw new NotFoundException('الملف غير موجود');
    }
    return {
      row,
      absolutePath: await this.verifiedPath(row.storage_key, row.byte_size),
    };
  }

  async open(id: string, user: JwtUser) {
    const row = await this.prisma.private_file_metadata.findFirst({
      where: { id, deleted_at: null, validation_status: 'validated' },
    });
    if (!row) throw new NotFoundException('الملف غير موجود');
    if (user.level !== 1) {
      if (row.owner_employee_id != null) {
        await this.assertEmployeeAccess(user, row.owner_employee_id);
      } else if (this.categories.policy(row.category)?.employeeOwner === true) {
        if (row.uploaded_by !== user.sub) {
          throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا الملف');
        }
      } else if (row.branch_id != null) {
        if (!this.branches.isBranchAllowed(user, row.branch_id)) {
          throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا الملف');
        }
      } else if (row.uploaded_by !== user.sub) {
        throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا الملف');
      }
    }
    const absolutePath = await this.verifiedPath(row.storage_key, row.byte_size);
    return { row, absolutePath };
  }

  async remove(id: string, user: JwtUser): Promise<{ id: string }> {
    const { row, absolutePath } = await this.open(id, user);
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.private_file_metadata.updateMany({
        where: { id, deleted_at: null },
        data: { deleted_at: new Date(), deleted_by: user.sub },
      });
      if (changed.count !== 1) throw new NotFoundException('الملف غير موجود');
      await tx.business_audit_log.create({
        data: {
          entity_type: 'private_file',
          entity_id: id,
          action: 'file.deleted',
          actor_user_id: user.sub,
          branch_id: row.branch_id,
          before_json: {
            category: row.category,
            ownerEmployeeId: row.owner_employee_id,
          },
          changed_fields: ['deleted_at'],
        },
      });
    });
    await unlink(absolutePath).catch(() => undefined);
    return { id };
  }

  private async assertEmployeeAccess(user: JwtUser, employeeId: number): Promise<void> {
    const where = await this.hrScope.employeeWhere(user);
    const count = await this.prisma.employees.count({
      where: { AND: [{ id: employeeId }, where] },
    });
    if (count !== 1) throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا الملف');
  }

  private absoluteStoragePath(storageKey: string): string {
    const root = this.storageRoot();
    const target = resolve(root, storageKey);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      throw new BadRequestException('مسار ملف غير صالح');
    }
    return target;
  }

  private storageRoot(): string {
    return resolve(process.cwd(), this.config.get<string>('privateUploadDir') ?? './private-uploads');
  }

  private async verifiedPath(storageKey: string, byteSize: bigint): Promise<string> {
    const absolutePath = this.absoluteStoragePath(storageKey);
    const info = await stat(absolutePath).catch(() => null);
    if (!info?.isFile() || BigInt(info.size) !== byteSize) {
      throw new NotFoundException('الملف غير موجود');
    }
    return absolutePath;
  }
}
