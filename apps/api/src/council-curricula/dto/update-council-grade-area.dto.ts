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

  @Transform(({ value }) => typeof value === "string" && value.trim().length === 0 ? undefined : typeof value === "string" ? value.trim() : value)
  @IsOptional()
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
