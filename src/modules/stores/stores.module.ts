import { Module } from '@nestjs/common';

import { StorePhotoStorage } from './store-photo.storage';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  controllers: [StoresController],
  providers: [StoresService, StorePhotoStorage],
  exports: [StoresService],
})
export class StoresModule {}
