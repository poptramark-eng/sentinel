import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class ImportLearnersDto {
  @IsString()
  @MaxLength(1_048_576)
  csv!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
