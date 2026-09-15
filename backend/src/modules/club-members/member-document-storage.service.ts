import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { basename, isAbsolute, join, resolve, sep } from 'path';

const MAX_MEMBER_DOCUMENT_BYTES = 5 * 1024 * 1024;
const STORAGE_KEY = /^member-document-[a-f0-9]{32}\.pdf$/;

function safeOriginalFilename(value: string | undefined) {
  const filename = basename(String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '')).trim();
  return (filename || 'member-document.pdf').slice(0, 255);
}

/** Private, traversal-safe storage for sensitive member documents. */
@Injectable()
export class MemberDocumentStorageService {
  constructor(private readonly config: ConfigService) {}

  private root() {
    const configured = this.config.get<string>('privateMemberDocumentDir') ?? './private-member-documents';
    const privateRoot = resolve(isAbsolute(configured) ? configured : join(process.cwd(), configured));
    const publicConfigured = this.config.get<string>('uploadDir') ?? './uploads';
    const publicRoot = resolve(isAbsolute(publicConfigured) ? publicConfigured : join(process.cwd(), publicConfigured));
    if (privateRoot === publicRoot || privateRoot.startsWith(`${publicRoot}${sep}`)) {
      throw new BadRequestException('مجلد مستندات الأعضاء يجب أن يكون خارج مجلد الملفات العامة');
    }
    return privateRoot;
  }

  private publicRoot() {
    const configured = this.config.get<string>('uploadDir') ?? './uploads';
    return resolve(isAbsolute(configured) ? configured : join(process.cwd(), configured));
  }

  private assertStorageKey(value: string) {
    const raw = String(value ?? '');
    const key = basename(raw);
    if (raw !== key || !STORAGE_KEY.test(key)) {
      throw new NotFoundException('مستند العضو غير موجود');
    }
    return key;
  }

  store(file: Express.Multer.File) {
    const buffer = file?.buffer;
    const byteSize = buffer?.length ?? 0;
    if (!buffer || byteSize < 1) throw new BadRequestException('ملف المستند مطلوب');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('نوع المستند يجب أن يكون PDF');
    if (byteSize > MAX_MEMBER_DOCUMENT_BYTES) throw new BadRequestException('حجم المستند يجب ألا يتجاوز 5 ميجابايت');
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('محتوى المستند لا يطابق ملف PDF');
    }

    const root = this.root();
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    const storageKey = `member-document-${randomBytes(16).toString('hex')}.pdf`;
    writeFileSync(join(root, storageKey), buffer, { flag: 'wx', mode: 0o600 });
    return {
      storageKey,
      originalFilename: safeOriginalFilename(file.originalname),
      mimeType: 'application/pdf' as const,
      byteSize,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  read(value: string) {
    const storageKey = this.assertStorageKey(value);
    const fullPath = join(this.root(), storageKey);
    if (!existsSync(fullPath)) throw new NotFoundException('مستند العضو غير موجود');
    return { storageKey, buffer: readFileSync(fullPath) };
  }

  readLegacy(value: string) {
    const raw = String(value ?? '').trim().replace(/^\/?uploads\//, '');
    const match = raw.match(/^(club\/membership-documents|membership-documents)\/([^/]+)$/);
    const filename = match?.[2] ?? '';
    if (!match || basename(filename) !== filename || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.pdf$/i.test(filename)) {
      throw new NotFoundException('مستند العضو غير موجود');
    }
    const publicRoot = this.publicRoot();
    const directory = resolve(publicRoot, match[1]);
    const fullPath = resolve(directory, filename);
    if (!fullPath.startsWith(`${directory}${sep}`) || !existsSync(fullPath)) {
      throw new NotFoundException('مستند العضو غير موجود');
    }
    const buffer = readFileSync(fullPath);
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new NotFoundException('مستند العضو غير موجود');
    }
    return { buffer, originalFilename: filename, mimeType: 'application/pdf' as const };
  }

  remove(value: string) {
    const storageKey = this.assertStorageKey(value);
    const fullPath = join(this.root(), storageKey);
    if (existsSync(fullPath)) unlinkSync(fullPath);
  }
}
