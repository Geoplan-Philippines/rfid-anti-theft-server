import { applyDecorators } from '@nestjs/common';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// The code limit matches the storeCode a sale may carry, so any code a till sends can be registered.
export const STORE_CODE_MAX_LENGTH = 120;
export const STORE_NAME_MAX_LENGTH = 120;
export const STORE_ADDRESS_MAX_LENGTH = 300;

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

// Multipart fields arrive as strings.
function parseBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
}

export function IsStoreCode(): PropertyDecorator {
  return applyDecorators(
    Transform(trimText),
    IsString({ message: 'Store code must be text.' }),
    IsNotEmpty({ message: 'Store code is required.' }),
    MaxLength(STORE_CODE_MAX_LENGTH, { message: `Store code must be ${STORE_CODE_MAX_LENGTH} characters or fewer.` }),
  );
}

export function IsStoreName(): PropertyDecorator {
  return applyDecorators(
    Transform(trimText),
    IsString({ message: 'Store name must be text.' }),
    IsNotEmpty({ message: 'Store name is required.' }),
    MaxLength(STORE_NAME_MAX_LENGTH, { message: `Store name must be ${STORE_NAME_MAX_LENGTH} characters or fewer.` }),
  );
}

/** Optional. A blank address is stored as null. */
export function IsStoreAddress(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    Transform(trimText),
    IsString({ message: 'Address must be text.' }),
    MaxLength(STORE_ADDRESS_MAX_LENGTH, { message: `Address must be ${STORE_ADDRESS_MAX_LENGTH} characters or fewer.` }),
  );
}

export function IsRemovePhotoFlag(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    Transform(parseBoolean),
    IsBoolean({ message: 'removePhoto must be true or false.' }),
  );
}
