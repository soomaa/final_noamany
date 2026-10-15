import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export type LocationType = 'country' | 'city' | 'region';

const LOCATION_TYPES: LocationType[] = ['country', 'city', 'region'];

export class ListLocationsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @IsIn(LOCATION_TYPES)
  type?: LocationType;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : parseInt(value, 10)))
  @IsInt()
  parent?: number;
}

export class CreateLocationDto {
  @IsString()
  name!: string;

  @IsString()
  @IsIn(LOCATION_TYPES)
  type!: LocationType;

  @IsOptional()
  @IsInt()
  parentId?: number;
}

export class UpdateLocationDto {
  @IsString()
  name!: string;
}
