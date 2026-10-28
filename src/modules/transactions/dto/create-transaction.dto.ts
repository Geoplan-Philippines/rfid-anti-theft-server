import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateTransactionTagDTO {
  @IsString()
  @IsNotEmpty()
  epc!: string;

  @IsDateString()
  scannedAt!: string;
}

export class CreateTransactionDTO {
  @IsUUID()
  clientTransactionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  storeCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  deviceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cashierName?: string;

  @IsDateString()
  startedAt!: string;

  @IsDateString()
  endedAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionTagDTO)
  tags!: CreateTransactionTagDTO[];
}
