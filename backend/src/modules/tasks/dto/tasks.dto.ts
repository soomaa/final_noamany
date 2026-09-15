import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

/** List: pagination + search (details/emp_name) + status filter (action_moder_rad). */
export class ListTasksDto extends ListQueryDto {}

/** A single line item (مكلّف) attached to a task. */
export class TaskMokalfaDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTaskDto {
  /** employees.id of the addressed employee (optional — name may be manual). */
  @IsOptional()
  @IsInt()
  empId?: number;

  @IsString()
  empName!: string;

  @IsOptional()
  @IsString()
  edara?: string;

  @IsOptional()
  @IsString()
  qesm?: string;

  @IsString()
  details!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskMokalfaDto)
  mokalfat?: TaskMokalfaDto[];
}

export class UpdateTaskDto {
  @IsOptional()
  @IsInt()
  empId?: number;

  @IsOptional()
  @IsString()
  empName?: string;

  @IsOptional()
  @IsString()
  edara?: string;

  @IsOptional()
  @IsString()
  qesm?: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskMokalfaDto)
  mokalfat?: TaskMokalfaDto[];
}

/**
 * Moderator decision on a task (action_moder_rad).
 * Mirrors legacy Api action: set accepted/refused + stamp date/time + notes.
 */
export class TaskActionDto {
  @IsIn(['accepted', 'refused'])
  decision!: 'accepted' | 'refused';

  @IsOptional()
  @IsString()
  notes?: string;
}
