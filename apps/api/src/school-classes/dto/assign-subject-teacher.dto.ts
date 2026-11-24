import { IsUUID } from "class-validator";

export class AssignSubjectTeacherDto {
  @IsUUID()
  membershipId!: string;

  @IsUUID()
  councilGradeLearningAreaId!: string;
}
