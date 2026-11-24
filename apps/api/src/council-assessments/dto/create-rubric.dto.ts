import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateRubricBandDto {
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,39}$/)
  code!: string;

  @IsString()
  @Length(1, 120)
  label!: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  lowerBound?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  upperBound?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(10000)
  sortOrder!: number;
}

export class CreateRubricDto {
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,39}$/)
  code!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @IsString()
  @Length(1, 40)
  versionLabel!: string;

  @IsIn(["NUMERIC_BANDS", "PERFORMANCE_LEVELS", "DESCRIPTIVE"])
  scaleType!: "NUMERIC_BANDS" | "PERFORMANCE_LEVELS" | "DESCRIPTIVE";

  @IsOptional()
  @IsString()
  @Length(1, 40)
  scoreUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  maxScore?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRubricBandDto)
  bands!: CreateRubricBandDto[];
}

export class CreateRubricVersionDto {
  @IsString()
  @Length(1, 40)
  versionLabel!: string;

  @IsIn(["NUMERIC_BANDS", "PERFORMANCE_LEVELS", "DESCRIPTIVE"])
  scaleType!: "NUMERIC_BANDS" | "PERFORMANCE_LEVELS" | "DESCRIPTIVE";

  @IsOptional()
  @IsString()
  @Length(1, 40)
  scoreUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  maxScore?: number;
}
