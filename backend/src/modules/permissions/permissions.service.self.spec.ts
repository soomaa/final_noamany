import { NotFoundException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

describe('PermissionsService self detail', () => {
  it('opens only a request owned by the authenticated employee or their own publisher account', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 19, emp_id_fk: 81, publisher: 44 });
    const service = new PermissionsService({ hr_all_ozonat_orders: { findFirst } } as never);

    await expect(service.selfDetail(19, 81, 44)).resolves.toMatchObject({ id: 19 });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 19, OR: [{ emp_id_fk: 81 }, { publisher: 44 }] },
    });
  });

  it('returns 404 instead of exposing a request merely addressed to the signed-in manager', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new PermissionsService({ hr_all_ozonat_orders: { findFirst } } as never);

    await expect(service.selfDetail(91, 81, 44)).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst.mock.calls[0][0].where).not.toHaveProperty('current_to_user_id');
  });
});
