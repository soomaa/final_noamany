import { legacyAudienceScopeFromEmployeeType } from './audience-scope.util';

describe('legacyAudienceScopeFromEmployeeType', () => {
  it.each([
    { employeeType: 1, expected: 0, label: 'men' },
    { employeeType: 2, expected: 1, label: 'women' },
    { employeeType: null, expected: -1, label: 'unlinked staff' },
    { employeeType: 99, expected: -1, label: 'unknown staff type' },
  ])('maps the current $label employee type into the legacy JWT scope', ({ employeeType, expected }) => {
    expect(legacyAudienceScopeFromEmployeeType(employeeType)).toBe(expected);
  });
});
