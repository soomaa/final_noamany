import { ClubOpsController } from './club-ops.controller';

describe('reception search metadata endpoint', () => {
  const user = { level: 2, branch: 2 } as never;
  function fixture() {
    const search = { subscriptionLabels: jest.fn().mockResolvedValue([]) };
    const controller = new ClubOpsController(search as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, {} as never);
    return { controller, search };
  }
  it('uses the employee login branch when the client omits its branch', () => {
    const { controller, search } = fixture();
    controller.searchMetadata('7,70', undefined, 'female', user);
    expect(search.subscriptionLabels).toHaveBeenCalledWith([7, 70], [2], 'female');
  });
  it('refuses another branch before reading subscription data', () => {
    const { controller, search } = fixture();
    expect(() => controller.searchMetadata('7', '1', 'female', user)).toThrow();
    expect(search.subscriptionLabels).not.toHaveBeenCalled();
  });
  it.each(['', '0', '-1', '7,x', '9007199254740992', Array(21).fill('7').join(',')])(
    'rejects malformed or oversized ID input %s', memberIds => {
      const { controller, search } = fixture();
      expect(() => controller.searchMetadata(memberIds, '2', undefined, user)).toThrow();
      expect(search.subscriptionLabels).not.toHaveBeenCalled();
    },
  );
});
