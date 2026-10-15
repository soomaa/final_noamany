// Isolated local MySQL regression: never reads the project's DATABASE_URL.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const database = `one80_photo_test_${process.pid}_${Date.now()}`;
const mysql = (sql) => execFileSync('mysql', ['--no-defaults', '-h', '127.0.0.1', '-u', 'root', '--connect-timeout=3', '-e', sql], { stdio: 'pipe' });
mysql(`CREATE DATABASE \`${database}\``);
const db = new PrismaClient({ datasourceUrl: `mysql://root@127.0.0.1:3306/${database}` });
try {
  await db.$executeRawUnsafe(`CREATE TABLE club_members (id INT PRIMARY KEY, profile_picture VARCHAR(255) NULL) ENGINE=InnoDB`);
  await db.$executeRawUnsafe(`CREATE TABLE business_audit_log (entity_type VARCHAR(60), entity_id VARCHAR(60), action VARCHAR(60)) ENGINE=InnoDB`);
  await db.$executeRawUnsafe(`INSERT INTO club_members VALUES (1,NULL),(2,'old.jpg'),(3,'logo.png'),(4,NULL),(5,'/uploads/user.png'),(6,'0'),(7,'new.jpg')`);
  await db.$executeRawUnsafe(`INSERT INTO business_audit_log VALUES ('club_member','4','profile.photo.updated')`);
  const migration = readFileSync(new URL('../prisma/migrations/20261003120000_member_photo_once/migration.sql', import.meta.url), 'utf8');
  for (const sql of migration.split(';').filter((s) => s.trim())) await db.$executeRawUnsafe(sql);
  const rows = await db.$queryRawUnsafe(`SELECT id, profile_photo_locked FROM club_members ORDER BY id`);
  assert.deepEqual(rows.map((r) => Number(r.profile_photo_locked)), [0, 1, 0, 1, 0, 0, 1]);
  console.log('PASS migration preserves first uploads, locks existing photos and past uploads');

  const claim = (photo) => db.$executeRawUnsafe(`UPDATE club_members SET profile_picture=?, profile_photo_locked=true WHERE id=1 AND profile_photo_locked=false AND profile_picture IS NULL`, photo);
  const results = await Promise.all([claim('first.jpg'), claim('second.jpg')]);
  assert.deepEqual([...results].sort(), [0, 1]);
  console.log('PASS concurrent first uploads: exactly one writer wins');

  await db.$executeRawUnsafe(`UPDATE club_members SET profile_picture=NULL, profile_photo_locked=true WHERE id=1`);
  assert.equal(await claim('after-staff-removal.jpg'), 0);
  await db.$executeRawUnsafe(`UPDATE club_members SET profile_picture='staff.jpg', profile_photo_locked=true WHERE id=1`);
  assert.equal(await claim('overwrite-staff.jpg'), 0);
  console.log('PASS staff removal/replacement never unlocks self-service');

  await db.$executeRawUnsafe(`UPDATE club_members SET profile_picture=NULL, profile_photo_locked=false WHERE id=1`);
  await Promise.all([
    claim('concurrent-member.jpg'),
    db.$executeRawUnsafe(`UPDATE club_members SET profile_picture='concurrent-staff.jpg', profile_photo_locked=true WHERE id=1`),
  ]);
  const [staffWinner] = await db.$queryRawUnsafe(`SELECT profile_picture, profile_photo_locked FROM club_members WHERE id=1`);
  assert.equal(staffWinner.profile_picture, 'concurrent-staff.jpg');
  assert.equal(Number(staffWinner.profile_photo_locked), 1);
  console.log('PASS concurrent staff edit cannot be overwritten by first member upload');

  await assert.rejects(db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`UPDATE club_members SET profile_picture='failed.jpg', profile_photo_locked=true WHERE id=3 AND profile_photo_locked=false`);
    throw new Error('simulated account/audit write failure');
  }));
  const [unchanged] = await db.$queryRawUnsafe(`SELECT profile_picture, profile_photo_locked FROM club_members WHERE id=3`);
  assert.equal(unchanged.profile_picture, 'logo.png');
  assert.equal(Number(unchanged.profile_photo_locked), 0);
  console.log('PASS transaction failure restores both photo and upload eligibility');
} finally {
  await db.$disconnect();
  mysql(`DROP DATABASE \`${database}\``);
}
