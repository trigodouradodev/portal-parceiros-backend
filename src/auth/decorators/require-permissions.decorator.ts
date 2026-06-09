import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../permissions/permission-keys';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Marca uma rota como protegida por permissões (semântica OR — basta ter uma).
 * Use junto do PermissionsGuard, após o JwtAuthGuard.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
