import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { basename, isAbsolute, join, resolve, sep } from 'path';

const MAX_BYTES = 5 * 1024 * 1024;
const signatures: Record<string, (buffer: Buffer) => boolean> = {
  'application/pdf': (b) => b.subarray(0, 5).toString('ascii') === '%PDF-',
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};
const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg' };

/** Private filesystem storage: no proof is placed under the publicly mounted `/uploads` root. */
@Injectable()
export class OnlineProofStorageService {
  constructor(private readonly config: ConfigService) {}

  private root() {
    const configured = this.config.get<string>('privateOnlineProofDir') ?? './private-online-proofs';
    const privateRoot = resolve(isAbsolute(configured) ? configured : join(process.cwd(), configured));
    const publicConfigured = this.config.get<string>('uploadDir') ?? './uploads';
    const publicRoot = resolve(isAbsolute(publicConfigured) ? publicConfigured : join(process.cwd(), publicConfigured));
    if (privateRoot === publicRoot || privateRoot.startsWith(`${publicRoot}${sep}`)) {
      throw new BadRequestException('مجلد إثباتات الدفع يجب أن يكون خارج مجلد الملفات العامة');
    }
    return privateRoot;
  }

  private filename(path: string) {
    const raw = String(path || '');
    const filename = basename(raw);
    if (raw !== filename || !/^proof-[a-f0-9]{32}\.(pdf|png|jpg)$/.test(filename)) {
      throw new NotFoundException('إثبات التحويل غير موجود');
    }
    return filename;
  }

  store(file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('إثبات التحويل مطلوب');
    if (!signatures[file.mimetype] || !signatures[file.mimetype](file.buffer)) throw new BadRequestException('نوع أو محتوى إثبات التحويل غير صالح');
    if (file.size < 1 || file.size > MAX_BYTES) throw new BadRequestException('حجم إثبات التحويل يجب ألا يتجاوز 5 ميجابايت');
    const root = this.root(); if (!existsSync(root)) mkdirSync(root, { recursive: true });
    const filename = `proof-${randomBytes(16).toString('hex')}.${extensions[file.mimetype]}`;
    writeFileSync(join(root, filename), file.buffer, { flag: 'wx' });
    return { path: filename, mime: file.mimetype, size: file.size };
  }

  read(path: string) {
    const filename = this.filename(path);
    const full = join(this.root(), filename);
    if (!existsSync(full)) throw new NotFoundException('إثبات التحويل غير موجود');
    return { buffer: readFileSync(full), filename };
  }

  remove(path: string) {
    const filename = this.filename(path);
    const full = join(this.root(), filename);
    if (existsSync(full)) unlinkSync(full);
  }
}
