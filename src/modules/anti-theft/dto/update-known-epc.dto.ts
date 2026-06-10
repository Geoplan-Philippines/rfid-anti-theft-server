import { IsOptional, IsString } from 'class-validator';

export class UpdateKnownEpcDto {
  @IsOptional()
  @IsString()
  epc?: string;

  @IsOptional()
  @IsString()
  label?: string;
}
