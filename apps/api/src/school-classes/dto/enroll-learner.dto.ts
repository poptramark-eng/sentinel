import { IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from "class-validator";

export class EnrollLearnerDto {
  @IsOptional()
  @IsUUID()
  learnerId?: string;

  @ValidateIf((value: EnrollLearnerDto) => !value.learnerId)
  @IsString()
  @Length(1, 80)
  givenName?: string;

  @ValidateIf((value: EnrollLearnerDto) => !value.learnerId)
  @IsString()
  @Length(1, 80)
  familyName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  otherNames?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Za-z0-9/-]+$/)
  admissionNumber?: string;
}
