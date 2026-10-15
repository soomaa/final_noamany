import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * POST /attendance/check — faithful port of Api::add_hdor_ensraf.
 * Punch is gated against the dwam time-window of the employee's shift.
 * `channel` selects the recording source (device | app | gps | qr | nfc | face).
 */
export class CheckPunchDto {
  @IsString()
  empCode!: string;

  /** explicit time override "h:i A" or "HH:mm"; defaults to server now */
  @IsOptional()
  @IsString()
  checkIn?: string;

  @IsOptional()
  @IsString()
  checkOut?: string;

  /** force direction; otherwise auto-detected from the dwam window */
  @IsOptional()
  @IsIn(['in', 'out'])
  type?: 'in' | 'out';

  @IsOptional()
  @IsString()
  lat?: string;

  @IsOptional()
  @IsString()
  long?: string;

  /** recording channel; must be enabled in attendance_channels */
  @IsOptional()
  @IsIn(['device', 'app', 'gps', 'qr', 'nfc', 'face'])
  channel?: string;

  @IsOptional()
  @IsString()
  photo?: string;
}
