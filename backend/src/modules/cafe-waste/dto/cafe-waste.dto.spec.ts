import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCafeWasteDto,
  CreateCafeWasteReasonDto,
  ListCafeWasteRecordsDto,
  PreviewCafeWasteDto,
  ReverseCafeWasteDto,
} from './cafe-waste.dto';

describe('cafe waste DTO validation', () => {
  it('rejects a zero waste quantity', async () => {
    const dto = plainToInstance(PreviewCafeWasteDto, {
      sourceKind: 'inventory',
      sourceId: 4,
      branchId: 2,
      quantity: 0,
      unit: 'g',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'quantity')).toBe(true);
  });

  it('rejects an unknown waste source kind', async () => {
    const dto = plainToInstance(PreviewCafeWasteDto, {
      sourceKind: 'supplier_invoice',
      sourceId: 4,
      branchId: 2,
      quantity: 1,
      unit: 'piece',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'sourceKind')).toBe(true);
  });

  it('requires a meaningful reversal reason', async () => {
    const dto = plainToInstance(ReverseCafeWasteDto, { reason: '   ' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });

  it('rejects a whitespace-only global reason after transformation', async () => {
    const dto = plainToInstance(CreateCafeWasteReasonDto, { name: '   ' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('accepts only calendar dates for report filters, not timestamps', async () => {
    const dto = plainToInstance(ListCafeWasteRecordsDto, {
      dateFrom: '2026-08-21T01:00:00Z',
      dateTo: '2026-08-21',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'dateFrom')).toBe(true);
  });

  it('transforms a positive shift session id and rejects zero', async () => {
    const valid = plainToInstance(CreateCafeWasteDto, {
      requestId: '15a31b6f-51f4-4a1f-89cb-84507d632bd3',
      sourceKind: 'inventory', sourceId: 4, branchId: 2,
      quantity: 1, unit: 'g', reasonId: 3, shiftSessionId: '41',
    });
    const invalid = plainToInstance(CreateCafeWasteDto, {
      requestId: '15a31b6f-51f4-4a1f-89cb-84507d632bd3',
      sourceKind: 'inventory', sourceId: 4, branchId: 2,
      quantity: 1, unit: 'g', reasonId: 3, shiftSessionId: '0',
    });

    expect(await validate(valid)).toHaveLength(0);
    expect(valid.shiftSessionId).toBe(41);
    expect((await validate(invalid)).some((error) => error.property === 'shiftSessionId')).toBe(true);
  });
});

