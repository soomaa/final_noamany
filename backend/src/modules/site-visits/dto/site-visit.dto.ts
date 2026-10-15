import { IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateSiteVisitDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @IsLatitude() lat!: number;
  @IsLongitude() long!: number;
  @IsOptional() @IsNumber() @Min(1) @Max(100_000) radius?: number;
  @IsOptional() @IsString() @MaxLength(255) siteName?: string;
}

export class UpdateSiteVisitDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) name?: string;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() long?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(100_000) radius?: number;
  @IsOptional() @IsString() @MaxLength(255) siteName?: string;
}
