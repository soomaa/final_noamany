import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateDocumentDto {
  @IsInt() @Min(1) empId!: number;
  @IsString() @IsNotEmpty() @MaxLength(300) title!: string;
  @IsOptional() @IsString() @Matches(/^file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) @MaxLength(500) filePath?: string;
  @IsOptional() @IsInt() @Min(1) docType?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) expiryDate?: string;
}
