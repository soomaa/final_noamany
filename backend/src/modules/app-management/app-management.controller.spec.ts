import { AppManagementController } from './app-management.controller';

describe('AppManagementController news types', () => {
  const controller = new AppManagementController({} as never);

  it('returns the fixed news types for mobile clients', () => {
    expect(controller.newsTypes()).toEqual({
      data: [
        { value: 'nutrition', label: 'التغذية' },
        { value: 'championships', label: 'البطولات' },
        { value: 'exercises', label: 'التمارين' },
        { value: 'supplements', label: 'المكملات' },
      ],
    });
  });
});
