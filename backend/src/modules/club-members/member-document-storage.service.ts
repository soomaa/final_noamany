import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'fs';
import { basename, isAbsolute, join, resolve, sep } from 'path';

const MAX_MEMBER_DOCUMENT_BYTES = 5 * 1024 * 1024;
const STORAGE_KEY = /^member-document-[a-f0-9]{32}\.(pdf|jpg|png|webp)$/;
const DOCUMENT_MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function safeOriginalFilename(value: string | undefined) {
  const filename = basename(String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '')).trim();
  return (filename || 'member-document').slice(0, 255);
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
    const extension = DOCUMENT_MIME_EXTENSIONS[file.mimetype];
    if (!extension) throw new BadRequestException('نوع المستند يجب أن يكون PDF أو صورة JPG أو PNG أو WEBP');
    if (byteSize > MAX_MEMBER_DOCUMENT_BYTES) throw new BadRequestException('حجم المستند يجب ألا يتجاوز 5 ميجابايت');
    const isPdf = file.mimetype === 'application/pdf' && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    const isJpeg = file.mimetype === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = file.mimetype === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = file.mimetype === 'image/webp' && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isPdf && !isJpeg && !isPng && !isWebp) throw new BadRequestException('محتوى المستند لا يطابق نوع الملف');

    const root = this.root();
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    const storageKey = `member-document-${randomBytes(16).toString('hex')}.${extension}`;
    writeFileSync(join(root, storageKey), buffer, { flag: 'wx', mode: 0o600 });
    return {
      storageKey,
      originalFilename: safeOriginalFilename(file.originalname),
      mimeType: file.mimetype,
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

  migratedAttachmentInfo(value: string) {
    const filename = basename(String(value).replace(/\\/g, '/').split(/[?#]/)[0]);
    const extension = filename.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
    };
    return { originalFilename: filename, mimeType: types[extension ?? ''] ?? 'application/octet-stream' };
  }

  readMigratedAttachment(value: string) {
    let relative = String(value).trim().replace(/\\/g, '/');
    if (/^https?:\/\//i.test(relative)) {
      const url = new URL(relative);
      if (!/(^|\.)noamanycenter\.com$/i.test(url.hostname)) throw new NotFoundException('مرفق العضو غير موجود');
      relative = url.pathname;
    }
    relative = relative.split(/[?#]/)[0];
    try { relative = decodeURIComponent(relative); } catch { throw new NotFoundException('مرفق العضو غير موجود'); }
    relative = relative.replace(/^\/?uploads\//, '').replace(/^\/+/, '');
    if (!relative || relative.includes('\0') || relative.includes('\\') || relative.split('/').some((part) => part === '..' || part === '.')) {
      throw new NotFoundException('مرفق العضو غير موجود');
    }
    const candidates = relative.includes('/') ? [relative] : [`member_attaches/${relative}`, `member/${relative}`];
    const publicRoot = realpathSync(this.publicRoot());
    const matches = candidates.filter((candidate) => /^(member_attaches|member)\//.test(candidate)).map((candidate) => resolve(publicRoot, candidate)).filter((fullPath) => {
      if (!existsSync(fullPath)) return false;
      const real = realpathSync(fullPath);
      return real.startsWith(`${publicRoot}${sep}`);
    });
    if (matches.length !== 1) throw new NotFoundException('ملف المرفق غير موجود أو مساره غير محدد');
    const buffer = readFileSync(matches[0]);
    const isPdf = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    const isGif = /^(GIF87a|GIF89a)$/.test(buffer.subarray(0, 6).toString('ascii'));
    const isBmp = buffer.subarray(0, 2).toString('ascii') === 'BM';
    const mimeType = isPdf ? 'application/pdf' : isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : isGif ? 'image/gif' : isBmp ? 'image/bmp' : null;
    if (!mimeType) throw new NotFoundException('نوع ملف المرفق غير مدعوم');
    return { buffer, originalFilename: this.migratedAttachmentInfo(relative).originalFilename, mimeType };
  }
}
