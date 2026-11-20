import { IsOptional } from 'class-validator';

import { IsRemovePhotoFlag, IsStoreAddress, IsStoreCode, IsStoreName } from './store-fields';

/**
 * Multipart or JSON body. Omitted fields stay as they are; a blank address clears it.
 * A new `photo` file replaces the old one. `removePhoto=true` without a file clears the photo.
 */
export class UpdateStoreDTO {
  @IsOptional()
  @IsStoreCode()
  code?: string;

  @IsOptional()
  @IsStoreName()
  name?: string;

  @IsStoreAddress()
  address?: string;

  @IsRemovePhotoFlag()
  removePhoto?: boolean;
}
