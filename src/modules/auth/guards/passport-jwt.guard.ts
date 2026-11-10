import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/auth.types';

@Injectable()
export class PassportJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization?.trim();

    if (!authorization) {
      throw new UnauthorizedException(
        'Authentication required. Sign in at POST /api/v1/auth/login and send Authorization: Bearer <accessToken>',
      );
    }

    const [scheme, token, extra] = authorization.split(/\s+/);
    if (scheme?.toLowerCase() !== 'bearer' || !token || extra) {
      throw new UnauthorizedException('Authorization must use the format: Bearer <accessToken>');
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = AuthenticatedUser>(err: unknown, user: TUser | false | null, info: unknown): TUser {
    if (err instanceof UnauthorizedException) {
      throw err;
    }

    if (err || !user) {
      const message = info instanceof Error && info.name === 'TokenExpiredError'
        ? 'Access token expired. Sign in again at POST /api/v1/auth/login'
        : 'Invalid access token. Sign in again at POST /api/v1/auth/login';
      throw new UnauthorizedException(message);
    }

    return user;
  }
}
