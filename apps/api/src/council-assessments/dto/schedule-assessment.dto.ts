import { IsDateString } from "class-validator";

export class ScheduleAssessmentDto {
  @IsDateString()
  opensAt!: string;

  @IsDateString()
  closesAt!: string;
}
