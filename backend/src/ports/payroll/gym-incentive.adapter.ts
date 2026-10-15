export const GYM_INCENTIVE_ADAPTER = Symbol('GYM_INCENTIVE_ADAPTER');

export interface GymIncentiveInput {
  employeeId: number;
  employeeCode: number;
  fromDate: string;
  toDate: string;
}

export interface GymIncentiveAdapter {
  calculate(input: GymIncentiveInput): Promise<number>;
}

export class DisabledGymIncentiveAdapter implements GymIncentiveAdapter {
  async calculate(_input: GymIncentiveInput): Promise<number> {
    return 0;
  }
}
