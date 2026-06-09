import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
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

    const hasAny = required.some((permission) =>
      userPermissions.has(permission),
    );
    if (!hasAny) {
      throw new ForbiddenException('Permissão insuficiente');
    }

    return true;
  }
}
