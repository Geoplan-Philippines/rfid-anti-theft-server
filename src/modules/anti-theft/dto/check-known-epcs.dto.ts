import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// One gate packet holds a handful of tags; the bridge splits anything bigger into several checks.
export const MAX_EPCS_PER_CHECK = 100;
export const MAX_EPC_LENGTH = 128;

export class CheckKnownEpcsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EPCS_PER_CHECK)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_EPC_LENGTH, { each: true })
  epcs!: string[];
}
