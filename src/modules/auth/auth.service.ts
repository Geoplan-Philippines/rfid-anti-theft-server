import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { LoginDTO } from './dto/login.dto';
import type { AuthResult, LoginUser } from './types/auth.types';

// Pre-computed bcrypt hash of a random string. Used to keep timing constant
// when the user lookup misses, so attackers can't enumerate accounts.
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.D6Z/3p1zVcr7e9LpO5z9C5jM1qWG';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {}

  async validateUser(loginDto: LoginDTO): Promise<LoginUser> {
    const user = await this.usersService.findUserByEmail(loginDto.email);
    const isValid = await bcrypt.compare(loginDto.password, user?.password ?? DUMMY_HASH);

    if (!user || !isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { password, ...safeUser } = user;

    return safeUser;
  }

  async login(user: LoginUser): Promise<AuthResult> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      accessToken,
    };
  }
}
