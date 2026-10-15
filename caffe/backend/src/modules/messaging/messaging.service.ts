import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CreateMemoDto,
  CreateMessageDto,
  ListMessagesDto,
  ReplyMessageDto,
} from './dto/messaging.dto';

/** A single inbox/sent row as the frontend list consumes it. */
export interface MessageRow {
  id: number;
  title: string | null;
  subject: string | null;
  body: string | null;
  date: string | null;
  time: string | null;
  /** sender display name (inbox) */
  fromName: string | null;
  /** recipient display name(s) summary (sent) */
  toName: string | null;
  seen: boolean;
  sendAll: boolean;
}

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Now as legacy varchar date/time strings. */
  private now() {
    const d = new Date();
    return { date: d.toISOString().slice(0, 10), time: d.toTimeString().slice(0, 5) };
  }

  private async userName(userId: number | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const u = await this.prisma.users.findUnique({ where: { user_id: userId } });
    return u?.name ?? null;
  }

  /**
   * Inbox — personal messages addressed to me.
   * Joins hr_ta3mem_personal_msg_details (to_user_id = me, not deleted) onto the
   * parent message and returns parent fields + my per-recipient seen flag.
   */
  async inbox(q: ListMessagesDto, user: JwtUser) {
    const where: Prisma.hr_ta3mem_personal_msg_detailsWhereInput = {
      to_user_id: user.sub,
      deleted: 0,
    };

    const [details, total] = await Promise.all([
      this.prisma.hr_ta3mem_personal_msg_details.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_ta3mem_personal_msg_details.count({ where }),
    ]);

    const data = await Promise.all(
      details.map(async (det) => {
        const msg = det.ta3mem_msg_id_fk
          ? await this.prisma.hr_ta3mem_personal_msg.findUnique({
              where: { id: det.ta3mem_msg_id_fk },
            })
          : null;
        const row: MessageRow = {
          id: msg?.id ?? det.ta3mem_msg_id_fk ?? det.id,
          title: msg?.msg_title ?? null,
          subject: msg?.subject ?? null,
          body: msg?.message ?? null,
          date: msg?.msg_date ?? det.send_date ?? null,
          time: msg?.msg_time ?? det.send_time ?? null,
          fromName: await this.userName(msg?.from_user_id),
          toName: det.emp_name ?? null,
          seen: det.seen === 1,
          sendAll: (msg?.send_all_t3mem ?? 0) === 1,
        };
        return row;
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  /** Sent — personal messages I authored (not soft-deleted). */
  async sent(q: ListMessagesDto, user: JwtUser) {
    const where: Prisma.hr_ta3mem_personal_msgWhereInput = {
      from_user_id: user.sub,
      deleted: 0,
    };

    const [rows, total] = await Promise.all([
      this.prisma.hr_ta3mem_personal_msg.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_ta3mem_personal_msg.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (msg) => {
        const recipients = await this.prisma.hr_ta3mem_personal_msg_details.findMany({
          where: { ta3mem_msg_id_fk: msg.id, deleted: 0 },
          orderBy: { id: 'asc' },
        });
        const names = recipients
          .map((r) => r.emp_name)
          .filter((n): n is string => !!n);
        const toName =
          msg.send_all_t3mem === 1
            ? 'الجميع'
            : names.length > 2
              ? `${names.slice(0, 2).join('، ')} +${names.length - 2}`
              : names.join('، ') || null;
        const row: MessageRow = {
          id: msg.id,
          title: msg.msg_title,
          subject: msg.subject,
          body: msg.message,
          date: msg.msg_date,
          time: msg.msg_time,
          fromName: msg.publisher_name ?? null,
          toName,
          // a sent message is "seen" once every recipient has opened it.
          seen: recipients.length > 0 && recipients.every((r) => r.seen === 1),
          sendAll: msg.send_all_t3mem === 1,
        };
        return row;
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  /**
   * Full message + recipients. If the current user is a recipient whose detail
   * row is still unseen, mark it seen (seen=1, seen_date/time = now).
   */
  async get(id: number, user: JwtUser) {
    const msg = await this.prisma.hr_ta3mem_personal_msg.findUnique({ where: { id } });
    if (!msg || msg.deleted === 1) throw new NotFoundException('الرسالة غير موجودة');

    const recipients = await this.prisma.hr_ta3mem_personal_msg_details.findMany({
      where: { ta3mem_msg_id_fk: id, deleted: 0 },
      orderBy: { id: 'asc' },
    });

    const mine = recipients.find((r) => r.to_user_id === user.sub);
    const isSender = msg.from_user_id === user.sub;
    if (!mine && !isSender) {
      throw new ForbiddenException('لا تملك صلاحية عرض هذه الرسالة');
    }

    if (mine && mine.seen !== 1) {
      const { date, time } = this.now();
      await this.prisma.hr_ta3mem_personal_msg_details.update({
        where: { id: mine.id },
        data: { seen: 1, seen_date: date, seen_time: time },
      });
      mine.seen = 1;
    }

    return {
      id: msg.id,
      title: msg.msg_title,
      subject: msg.subject,
      body: msg.message,
      date: msg.msg_date,
      time: msg.msg_time,
      file: msg.file,
      fromUserId: msg.from_user_id,
      fromName: (await this.userName(msg.from_user_id)) ?? msg.publisher_name ?? null,
      sendAll: msg.send_all_t3mem === 1,
      isSender,
      recipients: recipients.map((r) => ({
        id: r.id,
        empName: r.emp_name,
        toEmpId: r.to_emp_id,
        toUserId: r.to_user_id,
        seen: r.seen === 1,
        seenDate: r.seen_date,
      })),
    };
  }

  /**
   * Compose a personal message: one parent hr_ta3mem_personal_msg row + one
   * details row per recipient. to_user_id is resolved from users.emp_code when a
   * matching user exists. sendAll fans out to every active employee and flags
   * send_all_t3mem=1.
   */
  async create(dto: CreateMessageDto, user: JwtUser) {
    const { date, time } = this.now();

    const parent = await this.prisma.hr_ta3mem_personal_msg.create({
      data: {
        msg_title: dto.title,
        subject: dto.subject ?? null,
        message: dto.body,
        from_user_id: user.sub,
        from_emp_id: user.emp_code ?? null,
        msg_date: date,
        msg_time: time,
        date,
        date_ar: date,
        publisher: user.sub,
        publisher_name: user.name ?? '',
        send_all_t3mem: dto.sendAll ? 1 : 0,
        file: dto.file ?? null,
        deleted: 0,
      },
    });

    const recipients = await this.resolveRecipients(dto);
    if (recipients.length) {
      await this.prisma.hr_ta3mem_personal_msg_details.createMany({
        data: recipients.map((r) => ({
          ta3mem_msg_id_fk: parent.id,
          to_user_id: r.userId,
          to_emp_id: r.empId,
          emp_code: r.empCode,
          emp_name: r.name,
          seen: 0,
          send_all_t3mem: dto.sendAll ? 1 : 0,
          send_date: date,
          send_time: time,
          deleted: 0,
        })),
      });
    }

    return { id: parent.id, recipients: recipients.length };
  }

  /** Soft-delete a message the current user authored. */
  async remove(id: number, user: JwtUser) {
    const msg = await this.prisma.hr_ta3mem_personal_msg.findUnique({ where: { id } });
    if (!msg || msg.deleted === 1) throw new NotFoundException('الرسالة غير موجودة');
    if (msg.from_user_id !== user.sub) {
      throw new ForbiddenException('لا يمكنك حذف رسالة لم ترسلها');
    }

    const { date, time } = this.now();
    await this.prisma.hr_ta3mem_personal_msg.update({
      where: { id },
      data: { deleted: 1, deleted_date: date, deleted_time: time },
    });
    return { id };
  }

  /**
   * Reply to a message: create a fresh personal message back to the original
   * sender, threading by reusing the subject with a 'رد: ' prefix.
   */
  async reply(id: number, dto: ReplyMessageDto, user: JwtUser) {
    const original = await this.prisma.hr_ta3mem_personal_msg.findUnique({ where: { id } });
    if (!original || original.deleted === 1) throw new NotFoundException('الرسالة غير موجودة');
    if (!original.from_user_id) {
      throw new NotFoundException('لا يوجد مرسل أصلي للرد عليه');
    }

    const { date, time } = this.now();
    const baseTitle = original.msg_title ?? original.subject ?? '';
    const title = baseTitle.startsWith('رد:') ? baseTitle : `رد: ${baseTitle}`.trim();

    const sender = await this.prisma.users.findUnique({
      where: { user_id: original.from_user_id },
    });

    const parent = await this.prisma.hr_ta3mem_personal_msg.create({
      data: {
        msg_title: title,
        subject: original.subject ?? null,
        message: dto.body,
        from_user_id: user.sub,
        from_emp_id: user.emp_code ?? null,
        msg_date: date,
        msg_time: time,
        date,
        date_ar: date,
        publisher: user.sub,
        publisher_name: user.name ?? '',
        send_all_t3mem: 0,
        deleted: 0,
      },
    });

    await this.prisma.hr_ta3mem_personal_msg_details.create({
      data: {
        ta3mem_msg_id_fk: parent.id,
        to_user_id: original.from_user_id,
        to_emp_id: original.from_emp_id ?? null,
        emp_code: sender?.emp_code ?? null,
        emp_name: sender?.name ?? null,
        seen: 0,
        send_all_t3mem: 0,
        send_date: date,
        send_time: time,
        deleted: 0,
      },
    });

    return { id: parent.id };
  }

  /**
   * Broadcast memo (hr_ta3mem_msg). Minimal admin create — stores the memo
   * header only.
   * NOTE: legacy also seeds hr_ta3mem_msg_details (one row per employee) and
   * hr_ta3mem_msg_attaches. Recipient fan-out + attachments are a follow-up;
   * inbox() currently surfaces personal messages only, not memos.
   */
  async createMemo(dto: CreateMemoDto, user: JwtUser) {
    const epoch = Math.floor(Date.now() / 1000);
    const memo = await this.prisma.hr_ta3mem_msg.create({
      data: {
        msg_title: dto.title,
        subject: dto.subject ?? null,
        msg_date: new Date().toISOString().slice(0, 10),
        publisher: user.sub,
        // legacy column is (mistakenly) an int — store the user id.
        publisher_name: user.sub,
        date: epoch,
        date_ar: epoch,
        send_all_t3mem: dto.sendAll ? 1 : 0,
      },
    });
    return { id: memo.id };
  }

  /** Broadcast memos, newest first (admin board). */
  async listMemos(q: ListMessagesDto) {
    const [rows, total] = await Promise.all([
      this.prisma.hr_ta3mem_msg.findMany({ orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_ta3mem_msg.count(),
    ]);
    const data = rows.map((m) => ({
      id: m.id,
      title: m.msg_title,
      subject: m.subject,
      date: m.msg_date,
      sendAll: m.send_all_t3mem === 1,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  /**
   * Resolve a compose payload into concrete recipient detail rows.
   * recipientEmpIds carry employees.id; sendAll expands to every active employee.
   */
  private async resolveRecipients(dto: { recipientEmpIds?: number[]; sendAll?: boolean }) {
    const employees = dto.sendAll
      ? await this.prisma.employees.findMany({ where: { status: 1 } })
      : await this.prisma.employees.findMany({
          where: { id: { in: dto.recipientEmpIds ?? [] } },
        });

    return Promise.all(
      employees.map(async (emp) => {
        // legacy users.emp_code stores employees.id for the linked account.
        const linked =
          await this.prisma.users.findFirst({ where: { emp_code: emp.id } });
        return {
          empId: emp.id,
          empCode: emp.emp_code ?? null,
          userId: linked?.user_id ?? null,
          name: emp.employee ?? null,
        };
      }),
    );
  }
}
