import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Editable HR employee-app pages; omitted fields retain their existing value. */
export class UpdateHrMobileContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  aboutTitle?: string;

  @IsOptional()
  @IsString()
  aboutBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  privacyTitle?: string;

  @IsOptional()
  @IsString()
  privacyBody?: string;
}
