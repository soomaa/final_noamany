import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateJobTitleDto {
  @IsString()
  @MinLength(1, { message: 'الاسم حقل ضرورى' })
  name!: string;

  /** Marks this job title as a gym trainer role (employees holding it sync into club_trainers). */
  @IsOptional()
  @IsBoolean()
  isTrainer?: boolean;

  /** parent job/dept (department_jobs.from_id_fk) — defaults to 0 */
  @IsOptional()
  @IsInt()
  parentId?: number;

  /** owning department (department_jobs.edara_id → hr_edarat_aqsam) */
  @IsOptional()
  @IsInt()
  edaraId?: number;

  /** job-title code (department_jobs.dep_code) */
  @IsOptional()
  @IsInt()
  code?: number;

  /** sort order (department_jobs.in_order — stored as numeric string) */
  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateJobTitleDto extends CreateJobTitleDto {}
