import assert from 'node:assert/strict';
import { prisma, getBranchIds } from './_shared';
import { seedWebsite } from './55-website';

async function run() {
  await seedWebsite();

  const branchIds = await getBranchIds();
  const [profiles, projects, sliders, settings] = await Promise.all([
    prisma.portal_branch_profiles.findMany({ select: { branch_id: true } }),
    prisma.design_web_projects.count(),
    prisma.design_web_slider.count(),
    prisma.portal_settings.count(),
  ]);

  assert.equal(profiles.length, branchIds.length, 'every demo branch must have a website profile');
  assert.deepEqual(profiles.map((row) => row.branch_id).sort((a, b) => a - b), branchIds);
  assert.ok(projects >= branchIds.length, 'website projects must cover all branches');
  assert.ok(sliders >= 3, 'website homepage needs slider content');
  assert.ok(settings >= 3, 'website settings must be populated');
}

run()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
