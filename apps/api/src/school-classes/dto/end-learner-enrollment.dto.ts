import { IsIn } from "class-validator";

export class EndLearnerEnrollmentDto {
  @IsIn(["TRANSFERRED", "WITHDRAWN", "COMPLETED"])
  status!: "TRANSFERRED" | "WITHDRAWN" | "COMPLETED";
}
