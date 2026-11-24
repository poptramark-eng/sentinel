import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export class UpdateCouncilGradeAreaDto {
  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  assessmentEligible!: boolean;

  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 180)
  displayLabel?: string;

  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder!: number;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(10, 2000)
  reason!: string;
}
