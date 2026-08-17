import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SELF_PARAM_KEY } from '../decorators/self-or-admin.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { PermissionKey } from '../permissions/permission-keys';

/**
 * Permite a requisição se o caller é admin (`ROLE_ADMIN`) OU se o id no
 * parâmetro da rota (definido por `@SelfOrAdmin('paramName')`) é o próprio
 * `sub` do caller. Útil para endpoints com escopo "ver/editar apenas o que é
 * meu" (ex.: `GET /manager/:managerId`).
 *
 * Aplicar por rota via `@UseGuards(SelfOrAdminGuard)`, após o JwtAuthGuard
 * global ter populado `request.user`.
 */
@Injectable()
export class SelfOrAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const paramName = this.reflector.getAllAndOverride<string>(SELF_PARAM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      params: Record<string, string>;
    }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Não autenticado');
    }

    if (user.permissions.includes(PermissionKey.ROLE_ADMIN)) {
      return true;
    }

    if (paramName && user.sub === request.params[paramName]) {
      return true;
    }

    throw new ForbiddenException('Acesso não autorizado ao recurso solicitado');
  }
}
