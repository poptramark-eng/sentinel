import { Transform } from "class-transformer";
import { IsInt, IsString, IsUrl, Length, Max, Min } from "class-validator";

export class UpdateCurriculumGradeAreaDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 180)
  sourceLabel!: string;

  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @Length(8, 2048)
  sourceUrl!: string;

  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder!: number;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(10, 2000)
  reason!: string;
}
