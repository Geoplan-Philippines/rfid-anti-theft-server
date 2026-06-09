import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateUserDTO } from './dto/create-user.dto';
import { User } from '@prisma/client';
import type { SafeUser } from './types/users.types';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(createUserDTO: CreateUserDTO): Promise<SafeUser> {
    const email = this.normalizeEmail(createUserDTO.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already in use');

    return this.prisma.user.create({
      data: {
        ...createUserDTO,
        email: email,
        password: await bcrypt.hash(createUserDTO.password, 10),
      },
      omit: { password: true },
    });
  }

  async getAllUsers() {
    return this.prisma.user.findMany({ omit: { password: true } });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: this.normalizeEmail(email) } });
  }

  async findUserById(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      omit: { password: true },
    });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
