import { createRequire } from 'node:module';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [appDir, mapPath, backupPath] = process.argv.slice(2);
if (!appDir || !mapPath || !backupPath) {
  throw new Error('Usage: node apply-one80-product-image-map.mjs APP_DIR MAP_FILE BACKUP_FILE');
}

const backendDir = existsSync(join(appDir, 'backend/package.json')) ? join(appDir, 'backend') : appDir;
const requireFromBackend = createRequire(join(backendDir, 'package.json'));
requireFromBackend('dotenv').config({ path: join(backendDir, '.env') });
const { PrismaClient } = requireFromBackend('@prisma/client');

const lines = readFileSync(mapPath, 'utf8').trim().split(/\r?\n/);
if (lines.shift() !== 'id\timage_url') throw new Error('Unexpected image map header');
const rows = lines.map((line) => {
  const separator = line.indexOf('\t');
  const id = Number(line.slice(0, separator));
  const imageUrl = line.slice(separator + 1).trim();
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Invalid product id: ${line}`);
  const url = new URL(imageUrl);
  if (url.protocol !== 'https:' || imageUrl.length > 500) throw new Error(`Invalid image URL for product ${id}`);
  return { id, imageUrl };
});

if (rows.length !== 100 || new Set(rows.map((row) => row.id)).size !== rows.length) {
  throw new Error(`Expected exactly 100 unique product mappings, received ${rows.length}`);
}

const prisma = new PrismaClient();
try {
  const existing = await prisma.cafe_products.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    select: { id: true, image_url: true },
  });
  if (existing.length !== rows.length) {
    const found = new Set(existing.map((row) => row.id));
    const missing = rows.filter((row) => !found.has(row.id)).map((row) => row.id);
    throw new Error(`Production product IDs changed; missing: ${missing.join(', ')}`);
  }

  writeFileSync(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    rows: existing.sort((a, b) => a.id - b.id),
  }, null, 2));
  chmodSync(backupPath, 0o600);
  console.log(`Product image backup created: ${backupPath}`);

  const results = await prisma.$transaction(
    rows.map((row) => prisma.cafe_products.updateMany({
      where: {
        id: row.id,
        OR: [{ image_url: null }, { image_url: '' }],
      },
      data: { image_url: row.imageUrl },
    })),
  );
  const updated = results.reduce((sum, result) => sum + result.count, 0);
  const verified = await prisma.cafe_products.count({
    where: {
      OR: rows.map((row) => ({ id: row.id, image_url: row.imageUrl })),
    },
  });
  console.log(`Image map applied: updated=${updated}, exact_matches=${verified}, preserved_existing=${rows.length - updated}`);
} finally {
  await prisma.$disconnect();
}
