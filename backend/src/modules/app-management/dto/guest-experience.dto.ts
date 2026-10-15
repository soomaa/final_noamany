import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class GuestBranchDto {
  id!: number;
  /** Profile display name when an admin set one, else the operational branch name. */
  name!: string;
  lat!: string | null;
  lng!: string | null;
  /** Present only when the branch has a profile («الفروع»). */
  nameEn?: string;
  tagline?: string | null;
  about?: string | null;
  address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  mapUrl?: string | null;
  coverImageUrl?: string | null;
  galleryUrls?: string[];
  workingHours?: Array<{ weekday: number; closed: boolean; opensAt: string | null; closesAt: string | null }>;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  sortOrder?: number;
}

export class GuestCafeCategoryDto {
  id!: number;
  name!: string;
}

export class GuestCafeProductDto {
  id!: number;
  name!: string;
  description?: string;
  imageUrl!: string | null;
  sellPrice!: number;
  isAvailable!: boolean;
  categories!: GuestCafeCategoryDto[];
}

export class CreateGuestLeadDto {
  @IsString() @MinLength(2) @MaxLength(200) fullName!: string;
  @IsString() @MinLength(6) @MaxLength(50) phone!: string;
  @Type(() => Number) @IsInt() @Min(1) branchId!: number;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  interestKeys?: string[];
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subscriptionTypeId?: number;
}

export interface GuestLeadResult {
  id: number;
  created: boolean;
}
