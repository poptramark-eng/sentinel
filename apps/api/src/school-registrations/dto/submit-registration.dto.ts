import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from "class-validator";

export enum SchoolIdentifierClaimType {
  MINISTRY_REGISTRY = "MINISTRY_REGISTRY",
  COUNCIL_REGISTRY = "COUNCIL_REGISTRY",
  OTHER = "OTHER",
}

export class SchoolIdentifierClaimDto {
  @IsEnum(SchoolIdentifierClaimType)
  type!: SchoolIdentifierClaimType;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 120)
  issuer!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 120)
  value!: string;
}

export class SchoolDetailsDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 180)
  name!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SchoolIdentifierClaimDto)
  identifier?: SchoolIdentifierClaimDto;
}

export class SubmitSchoolRegistrationDto {
  @IsUUID()
  councilId!: string;

  @IsUUID()
  clusterId!: string;

  @ValidateNested()
  @Type(() => SchoolDetailsDto)
  school!: SchoolDetailsDto;

  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @MaxLength(80)
  registrationCode?: string;
}
