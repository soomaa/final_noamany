import { SettingsService } from './settings.service';

describe('SettingsService.updateCompany', () => {
  it('writes the public website footer tagline column, not only its summary_company fallback', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id_config: 1 });
    const update = jest.fn().mockResolvedValue({ id_config: 1, footer: 'جملة جديدة' });
    const service = new SettingsService({ conf_company_data: { findFirst, update } } as never);

    await service.updateCompany({ footer: 'جملة جديدة' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ footer: 'جملة جديدة' }),
    }));
  });

  it('ignores a field outside the editable whitelist', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id_config: 1 });
    const update = jest.fn().mockResolvedValue({ id_config: 1 });
    const service = new SettingsService({ conf_company_data: { findFirst, update } } as never);

    await service.updateCompany({ max_num: 999, id_config: 5 });

    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('max_num');
    expect(data).not.toHaveProperty('id_config');
  });
});
