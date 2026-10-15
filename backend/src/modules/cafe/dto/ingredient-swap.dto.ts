import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';

export class IngredientSwapRowDto {
  @IsIn(['product', 'variant'])
  recipeType!: 'product' | 'variant';

  @Transform(({ value }) => Number(value))
  @IsInt()
  recipeId!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class IngredientSwapDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  sourceIngredientId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  targetIngredientId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IngredientSwapRowDto)
  rows!: IngredientSwapRowDto[];
}

export class RemoveIngredientUsageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceIngredientId!: number;

  @IsIn(['product', 'variant'])
  recipeType!: 'product' | 'variant';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  recipeId!: number;
}
