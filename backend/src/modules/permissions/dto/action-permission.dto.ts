import { IsIn, IsOptional, IsString } from 'class-validator';

/** A `wared` recipient acting on the multi-stage approval chain. */
export class ActionPermissionDto {
  @IsString()
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';

  @IsOptional()
  @IsString()
  reason?: string;
}
