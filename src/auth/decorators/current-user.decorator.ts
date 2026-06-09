import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Injeta o payload do JWT autenticado (definido pela JwtStrategy).
 * Uso: `@CurrentUser() user: JwtPayload` ou `@CurrentUser('sub') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return data ? request.user[data] : request.user;
  },
);
