import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Length,
  ValidateNested,
} from "class-validator";

export class GeographyImportRowDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 120)
  region!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 120)
  county!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 120)
  subcounty!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 120)
  zone!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 120)
  cluster!: string;
}

export class GeographyImportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => GeographyImportRowDto)
  rows!: GeographyImportRowDto[];
}
