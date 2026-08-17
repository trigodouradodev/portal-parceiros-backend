import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionMode,
} from '../decorators/require-permissions.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { PermissionKey } from '../permissions/permission-keys';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const userPermissions = new Set(request.user?.permissions ?? []);

    // ROLE_ADMIN tem visão global: passa em qualquer rota com permissões.
    if (userPermissions.has(PermissionKey.ROLE_ADMIN)) {
      return true;
    }

    const mode =
      this.reflector.getAllAndOverride<PermissionMode>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'ANY';

    const hasPermission =
      mode === 'ALL'
        ? required.every((permission) => userPermissions.has(permission))
        : required.some((permission) => userPermissions.has(permission));

    if (!hasPermission) {
      throw new ForbiddenException('Permissão insuficiente');
    }

    return true;
  }
}
