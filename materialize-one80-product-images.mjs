import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const [appDir, mapPath, backupPath] = process.argv.slice(2);
if (!appDir || !mapPath || !backupPath) {
  throw new Error('Usage: node materialize-one80-product-images.mjs APP_DIR MAP_FILE BACKUP_FILE');
}

const requireFromApp = createRequire(join(appDir, 'package.json'));
requireFromApp('dotenv').config({ path: join(appDir, '.env') });
const { PrismaClient } = requireFromApp('@prisma/client');

const lines = readFileSync(mapPath, 'utf8').trim().split(/\r?\n/);
if (lines.shift() !== 'id\timage_url') throw new Error('Unexpected image map header');
const rows = lines.map((line) => {
  const separator = line.indexOf('\t');
  const id = Number(line.slice(0, separator));
  const imageUrl = line.slice(separator + 1).trim();
  if (!Number.isInteger(id) || !/^https:\/\//.test(imageUrl)) throw new Error(`Invalid mapping: ${line}`);
  return { id, imageUrl };
});
if (rows.length !== 100 || new Set(rows.map((row) => row.id)).size !== 100) {
  throw new Error(`Expected 100 unique mappings, received ${rows.length}`);
}

function detectImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', mime: 'image/webp' };
  }
  throw new Error('Unsupported image payload');
}

async function download(row) {
  const response = await fetch(row.imageUrl, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0 ONE80 image importer' },
  });
  if (!response.ok) throw new Error(`Image download failed for product ${row.id}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error(`Invalid image size for product ${row.id}`);
  return { ...row, buffer, ...detectImage(buffer), uuid: randomUUID() };
}

const prisma = new PrismaClient();
const writtenFiles = [];
try {
  const current = await prisma.cafe_products.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    select: { id: true, image_url: true },
  });
  if (current.length !== rows.length) throw new Error('Production product IDs no longer match the image map');
  writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rows: current }, null, 2));
  chmodSync(backupPath, 0o600);

  const currentById = new Map(current.map((row) => [row.id, row.image_url]));
  const pending = rows.filter((row) => {
    const value = currentById.get(row.id);
    return !value?.startsWith('public-file:');
  });
  for (const row of pending) {
    if (currentById.get(row.id) !== row.imageUrl) {
      throw new Error(`Product ${row.id} changed after review; refusing to overwrite it`);
    }
  }

  const downloaded = [];
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) downloaded.push(await download(pending[cursor++]));
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  const storageRoot = resolve(appDir, process.env.PRIVATE_UPLOAD_DIR ?? './private-uploads');
  const storageDir = join(storageRoot, 'product-image');
  mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  for (const image of downloaded) {
    const path = join(storageDir, `${image.uuid}.${image.extension}`);
    writeFileSync(path, image.buffer, { flag: 'wx', mode: 0o600 });
    writtenFiles.push(path);
  }


  const admin = await prisma.users.findFirst({
    where: { level: 1 },
    orderBy: { user_id: 'asc' },
    select: { user_id: true },
  });
  if (!admin) throw new Error('No administrator user was found for file attribution');

  await prisma.$transaction(async (tx) => {
    for (const image of downloaded) {
      await tx.private_file_metadata.create({
        data: {
          id: image.uuid,
          category: 'product-image',
          storage_key: `product-image/${image.uuid}.${image.extension}`,
          original_name: `temporary-product-${image.id}.${image.extension}`,
          mime_type: image.mime,
          byte_size: BigInt(image.buffer.length),
          sha256: createHash('sha256').update(image.buffer).digest('hex'),
          uploaded_by: admin.user_id,
        },
      });
      const updated = await tx.cafe_products.updateMany({
        where: { id: image.id, image_url: image.imageUrl },
        data: { image_url: `public-file:${image.uuid}` },
      });
      if (updated.count !== 1) throw new Error(`Concurrent product change detected for ${image.id}`);
    }
  }, { maxWait: 15000, timeout: 120000 });

  const verified = await prisma.cafe_products.count({
    where: { id: { in: rows.map((row) => row.id) }, image_url: { startsWith: 'public-file:' } },
  });
  console.log(`Product images materialized: imported=${downloaded.length}, public_file_refs=${verified}`);
} catch (error) {
  for (const path of writtenFiles) {
    if (existsSync(path)) {
      try { unlinkSync(path); } catch { /* preserve original failure */ }
    }
  }
  throw error;
} finally {
  await prisma.$disconnect();
}
