import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from './pagination.dto';

/**
 * Shared list query: pagination + the common optional filters used across modules.
 *
 * IMPORTANT: controllers must type the @Query() param as a concrete class (this one),
 * NOT as an intersection like `PaginationDto & { status?: string }`. An intersection
 * erases the runtime metatype, so Nest never instantiates the DTO — the @Transform and
 * the skip/take getters never run, and Prisma receives `undefined` for skip/take,
 * silently returning EVERY row. Using a real class restores transform + pagination.
 */
export class ListQueryDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() mode?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() expiry?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsIn(['male', 'female']) gender?: 'male' | 'female';
}
