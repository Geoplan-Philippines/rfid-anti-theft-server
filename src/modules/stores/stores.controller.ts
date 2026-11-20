import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { PaginationQueryDTO } from '../../common/dto/pagination-query.dto';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { CreateStoreDTO } from './dto/create-store.dto';
import { UpdateStoreDTO } from './dto/update-store.dto';
import type { UploadedStorePhoto } from './store-photo';
import { StorePhotoInterceptor } from './store-photo.interceptor';
import { StoresService, type StoreResponse } from './stores.service';

// The guard runs before the upload interceptor, so an unauthenticated request is refused before any file is read.
@Controller('stores')
@UseGuards(PassportJwtGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  async getStores(@Query() query: PaginationQueryDTO): Promise<PaginatedResponse<StoreResponse>> {
    return this.storesService.getStores(query);
  }

  @Get(':id')
  async getStore(@Param('id', ParseUUIDPipe) id: string): Promise<StoreResponse> {
    return this.storesService.getStore(id);
  }

  @Post()
  @UseInterceptors(StorePhotoInterceptor)
  async createStore(
    @Body() body: CreateStoreDTO,
    @UploadedFile() photo?: UploadedStorePhoto,
  ): Promise<StoreResponse> {
    return this.storesService.createStore(body, photo);
  }

  @Patch(':id')
  @UseInterceptors(StorePhotoInterceptor)
  async updateStore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStoreDTO,
    @UploadedFile() photo?: UploadedStorePhoto,
  ): Promise<StoreResponse> {
    return this.storesService.updateStore(id, body, photo);
  }

  @Delete(':id')
  async deleteStore(@Param('id', ParseUUIDPipe) id: string): Promise<StoreResponse> {
    return this.storesService.deleteStore(id);
  }
}
