import { IsString, Length } from "class-validator";

export class ReturnAssessmentMarksDto {
  @IsString()
  @Length(10, 2000)
  reason!: string;
}
