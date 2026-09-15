import { ClubMembersService } from './club-members.service';

describe('ClubMembersService legacy branch member codes', () => {
  const cases = [
    { branchId: 2, branchCode: 'C', maxNum: 12068, expected: 'C012069' },
    { branchId: 3, branchCode: 'A', maxNum: 20137, expected: 'A020138' },
    { branchId: 4, branchCode: 'B', maxNum: 18062, expected: 'B018063' },
    { branchId: 5, branchCode: 'C', maxNum: 12068, expected: 'C012069' },
    { branchId: 6, branchCode: 'C', maxNum: 12068, expected: 'C012069' },
  ] as const;

  it.each(cases)(
    'continues the shared $branchCode sequence for branch $branchId',
    async ({ branchId, branchCode, maxNum, expected }) => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ lockResult: 1 }])
        .mockResolvedValueOnce([{ maxNum }])
        .mockResolvedValueOnce([{ releaseResult: 1 }]);
      const tx = {
        tbl_branches: {
          findUnique: jest.fn().mockResolvedValue({
            branch_id: branchId,
            br_code: branchCode,
          }),
        },
        $queryRaw: queryRaw,
      };
      const service = new ClubMembersService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const code = await (
        service as unknown as {
          generateMemberCodeInTx: (transaction: unknown, id: number) => Promise<string>;
        }
      ).generateMemberCodeInTx(tx, branchId);

      expect(code).toBe(expected);
    },
  );
});
