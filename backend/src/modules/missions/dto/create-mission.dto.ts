import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateMissionDto {
  @IsInt()
  empId!: number;

  /** geha_mandate_name — destination / entity of the mission. */
  @IsString()
  destination!: string;

  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  /** mandate_direction — داخلية/خارجية etc. */
  @IsOptional()
  @IsString()
  direction?: string;

  /** mandate_distance — المسافة. */
  @IsOptional()
  @IsString()
  distance?: string;

  /** mandate_type_fk — نوع المأمورية. */
  @IsOptional()
  @IsInt()
  mandateTypeId?: number;

  /** geha_mandate_id_fk — id of the destination entity (if chosen from a list). */
  @IsOptional()
  @IsInt()
  destinationId?: number;

  /** bdal_count_method — '1' per-day, '2' lump-sum. */
  @IsOptional()
  @IsString()
  allowanceMethod?: string;

  /** bdal_value — per-unit or lump value. */
  @IsOptional()
  @IsString()
  allowanceValue?: string;
}
