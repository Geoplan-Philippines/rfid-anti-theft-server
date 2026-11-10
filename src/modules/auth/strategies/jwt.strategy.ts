import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { RoleEnum } from '@prisma/client';

import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AuthenticatedUser, JwtPayload } from '../types/auth.types';
import { env } from 'src/core/config/env.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  validate(payload: unknown): AuthenticatedUser {
    if (!isJwtPayload(payload)) {
      throw new UnauthorizedException('Access token is missing required user identity claims. Sign in again');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}

function isJwtPayload(payload: unknown): payload is JwtPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return typeof candidate.sub === 'string'
    && candidate.sub.trim().length > 0
    && typeof candidate.email === 'string'
    && candidate.email.trim().length > 0
    && Object.values(RoleEnum).some((role) => role === candidate.role);
}
