import { IsInt, IsString, Length, Min } from "class-validator";

export class RegistrationDecisionDto {
  @IsString()
  @Length(12, 1000)
  reason!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class WithdrawRegistrationDto {
  @IsString()
  @Length(8, 500)
  reason!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
