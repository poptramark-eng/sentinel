import { IsUUID } from "class-validator";

export class SelectCouncilCurriculumDto {
  @IsUUID()
  curriculumVersionId!: string;
}
