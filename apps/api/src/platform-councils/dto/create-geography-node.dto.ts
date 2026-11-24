import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";

export enum GeographyNodeType {
  REGION = "REGION",
  COUNTY = "COUNTY",
  SUBCOUNTY = "SUBCOUNTY",
  ZONE = "ZONE",
  CLUSTER = "CLUSTER",
}

export class CreateGeographyNodeDto {
  @IsEnum(GeographyNodeType)
  type!: GeographyNodeType;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @MaxLength(32)
  code?: string;
}
