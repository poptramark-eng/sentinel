import {
  IsString,
  IsUUID,
  Length,
} from "class-validator";

export class VerifySchoolIdentifierDto {
  @IsUUID()
  identifierId!: string;

  @IsString()
  @Length(12, 1000)
  reason!: string;
}
