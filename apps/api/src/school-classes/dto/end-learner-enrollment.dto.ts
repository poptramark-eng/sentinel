import { IsIn, IsString, Length } from "class-validator";

export class EndLearnerEnrollmentDto {
  @IsIn(["TRANSFERRED", "WITHDRAWN", "COMPLETED"])
  status!: "TRANSFERRED" | "WITHDRAWN" | "COMPLETED";

  @IsString()
  @Length(10, 1000)
  reason!: string;
}
