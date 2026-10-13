import { ClubMembersService } from './club-members.service';

describe('barcode preview input', () => {
  it.each([undefined, '', '   '])('rejects empty input before querying members (%s)', async (code) => {
    const service = Object.create(ClubMembersService.prototype) as ClubMembersService;
    await expect(service.barcodePreview(code as string)).rejects.toThrow('أدخل كود العضو');
  });
});
