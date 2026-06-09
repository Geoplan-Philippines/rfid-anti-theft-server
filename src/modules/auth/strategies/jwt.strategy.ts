import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthenticatedUser, JwtPayload } from '../types/auth.types';
import { env } from 'src/core/config/env.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    })
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return { 
      id: payload.sub, 
      email: payload.email,
      role: payload.role
    };
  }
}
