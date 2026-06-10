import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateKnownEpcDto {
  @IsNotEmpty()
  @IsString()
  epc!: string;

  @IsOptional()
  @IsString()
  label?: string;
}
