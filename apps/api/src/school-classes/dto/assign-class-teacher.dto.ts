import { IsUUID } from "class-validator";

export class AssignClassTeacherDto {
  @IsUUID()
  membershipId!: string;
}
