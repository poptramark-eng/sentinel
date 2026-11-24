import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export const REGISTRATION_STATUSES = [
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "WITHDRAWN",
  "EXPIRED",
] as const;

export type RegistrationStatusFilter =
  (typeof REGISTRATION_STATUSES)[number];

export class RegistrationQueryDto {
  @IsOptional()
  @IsIn(REGISTRATION_STATUSES)
  status?: RegistrationStatusFilter;

  @IsOptional()
  @IsUUID()
  councilId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}
