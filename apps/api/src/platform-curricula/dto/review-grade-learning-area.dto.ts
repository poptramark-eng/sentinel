import { Transform } from "class-transformer";
import { IsIn, IsString, Length } from "class-validator";

export class ReviewGradeLearningAreaDto {
  @IsIn(["CORE", "OPTIONAL"])
  optionality!: "CORE" | "OPTIONAL";

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(10, 2000)
  reason!: string;
}
