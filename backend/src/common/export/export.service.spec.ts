import { ExportService } from './export.service';

describe('ExportService CSV safety', () => {
  it.each(['=2+2', '+cmd', '-10', '@SUM(1,2)', '  =HYPERLINK("https://bad")', '\t@SUM(1,2)', '\r=1+1'])(
    'neutralizes spreadsheet formula input %p',
    (payload) => {
      const csv = new ExportService().toCsv([{ key: 'value', header: 'القيمة' }], [{ value: payload }]);
      expect(csv).toContain(`"'${payload.replace(/"/g, '""')}"`);
    },
  );

  it('quotes headers and values consistently', () => {
    const csv = new ExportService().toCsv(
      [{ key: 'value', header: 'اسم, العضو' }],
      [{ value: 'قال "ممتاز"\nثم غادر' }],
    );
    expect(csv).toBe('\uFEFF"اسم, العضو"\r\n"قال ""ممتاز""\nثم غادر"');
  });
});
