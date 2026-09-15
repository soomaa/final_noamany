import { OnlineCoachingMemberController } from './online-coaching-member.controller';

describe('OnlineCoachingMemberController', () => {
  const controller = new OnlineCoachingMemberController();
  const emptyState = { data: [], message: 'لا يوجد بيانات حاليًا' };

  it.each([
    ['nutrition', () => controller.nutrition()],
    ['workouts', () => controller.workouts()],
    ['chat', () => controller.chat()],
    ['coach notes', () => controller.coachNotes()],
  ])('returns the temporary empty state for %s', (_tab, request) => {
    expect(request()).toEqual(emptyState);
  });
});
