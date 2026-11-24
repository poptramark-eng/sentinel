import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

const grades = ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"] as const;

export class CreateSchoolClassDto {
  @IsIn(grades)
  grade!: (typeof grades)[number];

  @IsInt()
  @Min(2000)
  @Max(2100)
  academicYear!: number;

  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toUpperCase() : value)
  @IsString()
  @Length(1, 20)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  streamCode?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value)
  @IsString()
  @Length(1, 80)
  displayName?: string;
}
