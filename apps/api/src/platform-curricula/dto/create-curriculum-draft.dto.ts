import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

const grades = ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"] as const;

export class CurriculumDraftRowDto {
  @IsIn(grades)
  grade!: (typeof grades)[number];

  @IsString()
  @Length(2, 80)
  @Matches(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/)
  learningAreaCode!: string;

  @IsString()
  @Length(2, 180)
  canonicalName!: string;

  @IsString()
  @Length(2, 180)
  sourceLabel!: string;

  @IsUrl({ require_protocol: true })
  @Length(8, 2048)
  sourceUrl!: string;

  @IsIn(["UNKNOWN", "CORE", "OPTIONAL"])
  optionality!: "UNKNOWN" | "CORE" | "OPTIONAL";

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class CreateCurriculumDraftDto {
  @IsString()
  @Length(3, 80)
  @Matches(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/)
  curriculumCode!: string;

  @IsString()
  @Length(2, 180)
  curriculumName!: string;

  @IsString()
  @Length(2, 60)
  @Matches(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/)
  track!: string;

  @IsString()
  @Length(1, 80)
  versionLabel!: string;

  @IsString()
  @Length(3, 240)
  sourceTitle!: string;

  @IsUrl({ require_protocol: true })
  @Length(8, 2048)
  sourceUrl!: string;

  @IsDateString()
  sourceRetrievedAt!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  sourceSha256!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CurriculumDraftRowDto)
  rows!: CurriculumDraftRowDto[];
}
