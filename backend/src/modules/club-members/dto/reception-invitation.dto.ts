import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateReceptionInvitationDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  memberId: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  subscriptionId: number;

  @IsString()
  @MaxLength(200)
  guestName: string;

  @IsString()
  @MaxLength(30)
  guestPhone: string;

  /** The guest is at the desk now (records the visit). Defaults to true. */
  @IsOptional()
  @IsBoolean()
  guestHere?: boolean;
}
