import { IsString, Length } from "class-validator";

export class ReturnRubricForChangesDto {
  @IsString()
  @Length(10, 2000)
  reason!: string;
}
