import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  <T>(_data: unknown, ctx: ExecutionContext): T => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as T;
  },
);
