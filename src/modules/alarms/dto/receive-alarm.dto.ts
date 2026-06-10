import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReceiveAlarmDto {
  @IsNotEmpty()
  @IsString()
  epc!: string;

  @IsOptional()
  @IsString()
  readerName?: string;

  @IsOptional()
  @IsDateString()
  scannedAt?: string;
}
