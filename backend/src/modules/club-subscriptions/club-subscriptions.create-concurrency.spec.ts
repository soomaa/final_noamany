import { readFileSync } from 'node:fs';

describe('ClubSubscriptionsService create concurrency boundary', () => {
  it('allocates the number after the member row lock and retries a unique race', () => {
    const source = readFileSync(require.resolve('./club-subscriptions.service'), 'utf8');
    const createStart = source.indexOf('async create(');
    const createEnd = source.indexOf('\n  async update(', createStart);
    const createFlow = source.slice(createStart, createEnd);
    const lockIndex = createFlow.indexOf('FOR UPDATE');
    const allocationIndex = createFlow.indexOf('generateSubNumberForMemberInTransaction');
    const insertIndex = createFlow.indexOf('club_subscriptions.create');

    expect(createFlow).toContain('retryOnUniqueViolation');
    expect(lockIndex).toBeGreaterThan(-1);
    expect(allocationIndex).toBeGreaterThan(lockIndex);
    expect(insertIndex).toBeGreaterThan(allocationIndex);
  });
});
