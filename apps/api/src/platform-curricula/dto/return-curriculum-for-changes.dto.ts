import { Transform } from "class-transformer";
import { IsString, Length } from "class-validator";

export class ReturnCurriculumForChangesDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(10, 2000)
  reason!: string;
}
