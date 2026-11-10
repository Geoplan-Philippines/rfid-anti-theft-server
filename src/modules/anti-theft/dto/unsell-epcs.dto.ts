import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const MAX_EPCS_PER_UNSELL = 200;
export const MAX_UNSELL_EPC_LENGTH = 128;
export const MAX_UNSELL_REASON_LENGTH = 500;

export class UnsellEpcsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EPCS_PER_UNSELL)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_UNSELL_EPC_LENGTH, { each: true })
  epcs!: string[];

  @IsOptional()
  @Transform((params: TransformFnParams) => trimIfString(params.value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_UNSELL_REASON_LENGTH)
  reason?: string;
}

function trimIfString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
