import { Body, Controller, Get, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { PassportLocalGuard } from './guards/passport-local.guard';
import { PassportJwtGuard } from './guards/passport-jwt.guard';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser, AuthResult, LoginUser } from './types/auth.types';
import type { SafeUser } from '../users/types/users.types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(PassportLocalGuard)
  login(@CurrentUser() user: LoginUser): Promise<AuthResult> {
    return this.authService.login(user);
  }

  @Get('me')
  @UseGuards(PassportJwtGuard)
  async getUserInfo(@CurrentUser() user: AuthenticatedUser): Promise<SafeUser> {
    const fresh = await this.usersService.findUserById(user.id);
    if (!fresh) throw new UnauthorizedException('User no longer exists');
    return fresh;
  }
}
