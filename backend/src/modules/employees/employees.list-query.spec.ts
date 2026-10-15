import { ValidationPipe } from '@nestjs/common';
import { ListEmployeesDto } from './dto/list-employees.dto';

describe('ListEmployeesDto query validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  async function transform(query: Record<string, unknown>) {
    return pipe.transform(query, { type: 'query', metatype: ListEmployeesDto });
  }

  it('accepts active status filter used by employee options / create form', async () => {
    const dto = (await transform({ page: '1', pageSize: '200', status: '1' })) as ListEmployeesDto;
    expect(dto.status).toBe('1');
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(200);
  });

  it('accepts numeric status from axios params without failing @IsString', async () => {
    const dto = (await transform({ page: 1, pageSize: 200, status: 1 })) as ListEmployeesDto;
    expect(dto.status).toBe('1');
  });

  it('accepts resigned status for leavers list', async () => {
    const dto = (await transform({ page: '1', pageSize: '25', status: 'resigned' })) as ListEmployeesDto;
    expect(dto.status).toBe('resigned');
  });
});

describe('employee list status filter semantics', () => {
  function resolveStatus(status?: string) {
    const resigned = status === 'resigned' || status === 'left';
    let employeeType: number | undefined;
    if (status && status !== 'all' && !resigned) {
      const n = Number(status);
      if (Number.isFinite(n)) employeeType = n;
    }
    return { resigned, employeeType };
  }

  it('does not produce NaN employee_type for resigned', () => {
    expect(resolveStatus('resigned')).toEqual({ resigned: true, employeeType: undefined });
  });

  it('maps numeric status to employee_type', () => {
    expect(resolveStatus('1')).toEqual({ resigned: false, employeeType: 1 });
    expect(resolveStatus('2')).toEqual({ resigned: false, employeeType: 2 });
  });
});
