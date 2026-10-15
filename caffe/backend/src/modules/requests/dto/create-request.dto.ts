import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  notes?: string;

  // Flat fields from frontend forms are merged into payload by the controller.
  [key: string]: unknown;
}
