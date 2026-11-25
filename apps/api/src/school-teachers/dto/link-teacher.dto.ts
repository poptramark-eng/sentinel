import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class LinkTeacherDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim().replace(/\\s+/g, " ") : value)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  givenName?: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim().replace(/\\s+/g, " ") : value)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  familyName?: string;
}
