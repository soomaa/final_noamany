import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * List agents: pagination + search (name/mob/email/office_no) + an optional
 * activity filter. Legacy `tbl_agents.activity` is an enum('active','notactive');
 * we accept it directly as `activity` (the controller types @Query() as this
 * concrete class so pagination transforms still run).
 */
export class ListAgentsDto extends PaginationDto {
  @IsOptional()
  @IsIn(['active', 'notactive'])
  activity?: string;
}

export class CreateAgentDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: string;

  /** Relative upload path returned by POST /api/uploads/agent. */
  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  officeNo?: string;

  @IsOptional()
  @IsString()
  mob?: string;

  @IsOptional()
  @IsString()
  mob2?: string;

  @IsOptional()
  @IsString()
  mob3?: string;

  @IsOptional()
  @IsString()
  mob4?: string;

  @IsOptional()
  @IsString()
  fax?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  privateEmail?: string;

  @IsOptional()
  @IsString()
  facebook?: string;

  @IsOptional()
  @IsString()
  twitter?: string;

  @IsOptional()
  @IsString()
  instgram?: string;

  @IsOptional()
  @IsString()
  linkedin?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['active', 'notactive'])
  activity?: string;

  @IsOptional()
  @IsIn(['yes', 'no'])
  viewDetails?: string;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  officeNo?: string;

  @IsOptional()
  @IsString()
  mob?: string;

  @IsOptional()
  @IsString()
  mob2?: string;

  @IsOptional()
  @IsString()
  mob3?: string;

  @IsOptional()
  @IsString()
  mob4?: string;

  @IsOptional()
  @IsString()
  fax?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  privateEmail?: string;

  @IsOptional()
  @IsString()
  facebook?: string;

  @IsOptional()
  @IsString()
  twitter?: string;

  @IsOptional()
  @IsString()
  instgram?: string;

  @IsOptional()
  @IsString()
  linkedin?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['active', 'notactive'])
  activity?: string;

  @IsOptional()
  @IsIn(['yes', 'no'])
  viewDetails?: string;
}
