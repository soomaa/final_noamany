import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/* ------------------------- previous work ------------------------- */
export class PreviousWorkItemDto {
  @IsString()
  companyName!: string;

  @IsOptional()
  @IsString()
  jobIdTitleFk?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  jobMission?: string;

  @IsOptional()
  @IsString()
  salary?: string;

  @IsOptional()
  @IsString()
  leaveWorkReason?: string;
}

export class PreviousWorkDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreviousWorkItemDto)
  items!: PreviousWorkItemDto[];
}

/* ------------------------- qualifications ------------------------ */
export class QualificationItemDto {
  @IsOptional()
  @IsString()
  degreeIdFk?: string;

  @IsOptional()
  @IsString()
  qualificationIdFk?: string;

  @IsOptional()
  @IsString()
  school?: string;

  @IsOptional()
  @IsString()
  specialied?: string;

  @IsOptional()
  @IsString()
  year?: string;

  @IsOptional()
  @IsString()
  taqder?: string;

  @IsOptional()
  @IsString()
  img?: string;
}

export class QualificationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QualificationItemDto)
  items!: QualificationItemDto[];
}

/* ---------------------------- courses ---------------------------- */
export class CourseItemDto {
  @IsString()
  dawra!: string;

  @IsOptional()
  @IsString()
  place?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  specialized?: string;

  @IsOptional()
  @IsString()
  img?: string;
}

export class CoursesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseItemDto)
  items!: CourseItemDto[];
}

/* ----------------------------- skills ---------------------------- */
export class SkillItemDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsString()
  efficiencyIdFk?: string;
}

export class SkillsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillItemDto)
  items!: SkillItemDto[];
}

/* --------------------------- references -------------------------- */
export class PersonItemDto {
  @IsString()
  job!: string;

  @IsOptional()
  @IsString()
  jobName?: string;

  @IsOptional()
  @IsString()
  jobPlace?: string;

  @IsOptional()
  @IsString()
  mob?: string;
}

export class PersonsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonItemDto)
  items!: PersonItemDto[];
}

/* ------------------------ interview degree ----------------------- */
export class InterviewDegreeItemDto {
  @IsString()
  itemIdFk!: string;

  @IsString()
  itemDegree!: string;
}

export class InterviewDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterviewDegreeItemDto)
  degrees!: InterviewDegreeItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  positive?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  negative?: string[];

  /** overall interview total (legacy `total`) */
  @IsOptional()
  @IsString()
  total?: string;
}

/* ------------------------- interview date ------------------------ */
export class InterviewDateDto {
  @IsString()
  interviewDate!: string;
}

/* --------------------------- job offer --------------------------- */
export class JobOfferDto {
  @IsOptional()
  @IsString()
  salary?: string;

  @IsOptional()
  @IsString()
  bdlSakn?: string;

  @IsOptional()
  @IsString()
  bdlMoslat?: string;

  @IsOptional()
  @IsString()
  medicalInsurance?: string;

  @IsOptional()
  @IsString()
  contractPeroid?: string;

  @IsOptional()
  @IsString()
  contractTypeFk?: string;

  @IsOptional()
  @IsString()
  demoDays?: string;

  @IsOptional()
  @IsString()
  yearlyVacation?: string;

  @IsOptional()
  @IsString()
  other?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/* --------------------- application intake (main) ----------------- */
export class CreateApplicationDto {
  @IsString()
  name!: string;

  @IsString()
  nationalNum!: string;

  @IsOptional()
  @IsInt()
  genderIdFk?: number;

  @IsOptional()
  @IsInt()
  nationalityIdFk?: number;

  @IsOptional()
  @IsInt()
  socialStatus?: number;

  @IsOptional()
  @IsString()
  dateBirth?: string;

  @IsOptional()
  @IsString()
  dateBirthHijri?: string;

  @IsOptional()
  @IsString()
  placeBirth?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  hai?: string;

  /** job posting being applied to (hr_job_request.id) */
  @IsOptional()
  @IsInt()
  jobRequestIdFk?: number;

  @IsOptional()
  @IsString()
  jobNameOther?: string;

  @IsOptional()
  @IsString()
  mob?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsInt()
  workNow?: number;
}

export class UpdateApplicationDto extends CreateApplicationDto {}
