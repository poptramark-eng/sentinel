import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class AssessmentLearningAreaInputDto {
  @IsUUID()
  councilGradeLearningAreaId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  maxMarks!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  decimalPlaces!: number;
}

export class CreateAssessmentDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsString()
  @Length(2, 40)
  code!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  academicYear!: number;

  @IsIn(["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"])
  grade!: "GRADE_1" | "GRADE_2" | "GRADE_3" | "GRADE_4" | "GRADE_5" | "GRADE_6" | "GRADE_7" | "GRADE_8" | "GRADE_9";

  @IsEnum(["FORMATIVE", "SUMMATIVE", "PRACTICE", "OTHER"])
  type!: "FORMATIVE" | "SUMMATIVE" | "PRACTICE" | "OTHER";

  @IsUUID()
  rubricVersionId!: string;

  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssessmentLearningAreaInputDto)
  learningAreas!: AssessmentLearningAreaInputDto[];
}
