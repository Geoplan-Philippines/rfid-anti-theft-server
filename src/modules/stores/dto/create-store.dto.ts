import { IsStoreAddress, IsStoreCode, IsStoreName } from './store-fields';

/** Multipart or JSON body. The optional photo travels as the `photo` file field. */
export class CreateStoreDTO {
  @IsStoreCode()
  code!: string;

  @IsStoreName()
  name!: string;

  @IsStoreAddress()
  address?: string;
}
