import { IsNumber, IsUUID, Max, Min } from "class-validator";

export class UpdateAssessmentMarkDto {
  @IsUUID()
  candidateId!: string;

  @IsUUID()
  assessmentLearningAreaId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  marks!: number;
}
