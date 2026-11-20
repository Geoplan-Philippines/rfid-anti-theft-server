import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import type { PaginationQueryDTO } from '../../common/dto/pagination-query.dto';
import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { CreateStoreDTO } from './dto/create-store.dto';
import { UpdateStoreDTO } from './dto/update-store.dto';
import { normalizeStoreCode } from './store-code';
import type { UploadedStorePhoto } from './store-photo';
import { StorePhotoStorage } from './store-photo.storage';

const STORE_NOT_FOUND = 'Store not found';

const storeSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  photoUrl: true,
  createdAt: true,
} satisfies Prisma.StoreSelect;

export type StoreResponse = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  photoUrl: string | null;
  createdAt: Date;
};

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storePhotos: StorePhotoStorage,
  ) {}

  async getStores(query: PaginationQueryDTO): Promise<PaginatedResponse<StoreResponse>> {
    const { page, limit } = query;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.store.count(),
      this.prisma.store.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ name: 'asc' }, { code: 'asc' }],
        select: storeSelect,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async getStore(id: string): Promise<StoreResponse> {
    const store = await this.prisma.store.findUnique({ where: { id }, select: storeSelect });
    if (!store) {
      throw new NotFoundException(STORE_NOT_FOUND);
    }

    return store;
  }

  async createStore(body: CreateStoreDTO, photo?: UploadedStorePhoto): Promise<StoreResponse> {
    const normalizedCode = normalizeStoreCode(body.code);
    await this.assertStoreCodeAvailable(normalizedCode);
    const photoUrl = photo ? await this.storePhotos.saveStorePhoto(photo) : null;

    try {
      return await this.prisma.store.create({
        data: {
          code: body.code,
          normalizedCode,
          name: body.name,
          address: body.address || null,
          photoUrl,
        },
        select: storeSelect,
      });
    } catch (error) {
      await this.storePhotos.deleteStorePhoto(photoUrl);
      throw toStoreError(error, body.code);
    }
  }

  async updateStore(id: string, body: UpdateStoreDTO, photo?: UploadedStorePhoto): Promise<StoreResponse> {
    const existing = await this.prisma.store.findUnique({ where: { id }, select: { photoUrl: true } });
    if (!existing) {
      throw new NotFoundException(STORE_NOT_FOUND);
    }

    const normalizedCode = body.code === undefined ? undefined : normalizeStoreCode(body.code);
    if (normalizedCode) {
      await this.assertStoreCodeAvailable(normalizedCode, id);
    }

    // A new file wins over removePhoto. Either way the old file goes once the row points away from it.
    const replacesPhoto = Boolean(photo) || body.removePhoto === true;
    const newPhotoUrl = photo ? await this.storePhotos.saveStorePhoto(photo) : null;

    let updated: StoreResponse;
    try {
      updated = await this.prisma.store.update({
        where: { id },
        data: {
          code: body.code,
          normalizedCode,
          name: body.name,
          address: body.address === undefined ? undefined : body.address || null,
          ...(replacesPhoto ? { photoUrl: newPhotoUrl } : {}),
        },
        select: storeSelect,
      });
    } catch (error) {
      await this.storePhotos.deleteStorePhoto(newPhotoUrl);
      throw toStoreError(error, body.code);
    }

    if (replacesPhoto) {
      await this.storePhotos.deleteStorePhoto(existing.photoUrl);
    }

    return updated;
  }

  async deleteStore(id: string): Promise<StoreResponse> {
    let deleted: StoreResponse;
    try {
      deleted = await this.prisma.store.delete({ where: { id }, select: storeSelect });
    } catch (error) {
      throw toStoreError(error);
    }

    await this.storePhotos.deleteStorePhoto(deleted.photoUrl);
    return deleted;
  }

  /** Registered store names keyed by normalized code, for linking sales to stores at read time. */
  async getStoreNamesByCodes(storeCodes: string[]): Promise<Map<string, string>> {
    const normalizedCodes = [...new Set(storeCodes.map(normalizeStoreCode))];
    if (normalizedCodes.length === 0) {
      return new Map();
    }

    const stores = await this.prisma.store.findMany({
      where: { normalizedCode: { in: normalizedCodes } },
      select: { normalizedCode: true, name: true },
    });

    return new Map(stores.map((store) => [store.normalizedCode, store.name]));
  }

  private async assertStoreCodeAvailable(normalizedCode: string, storeId?: string): Promise<void> {
    const taken = await this.prisma.store.findUnique({
      where: { normalizedCode },
      select: { id: true, code: true },
    });

    if (taken && taken.id !== storeId) {
      throw new ConflictException(storeCodeTakenMessage(taken.code));
    }
  }
}

function storeCodeTakenMessage(code: string): string {
  return `A store with code "${code}" already exists. Store codes are not case-sensitive.`;
}

/** Maps the unique-code race (P2002) to the same 409 the pre-check gives, and a vanished row (P2025) to 404. */
function toStoreError(error: unknown, code?: string): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return error;
  }

  if (error.code === 'P2002' && code) {
    return new ConflictException(storeCodeTakenMessage(code));
  }

  if (error.code === 'P2025') {
    return new NotFoundException(STORE_NOT_FOUND);
  }

  return error;
}
