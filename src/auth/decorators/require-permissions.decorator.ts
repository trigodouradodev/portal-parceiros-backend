import { applyDecorators, SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../permissions/permission-keys';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const PERMISSIONS_MODE_KEY = 'requiredPermissionsMode';

/** ANY = basta ter uma das permissões; ALL = precisa ter todas. */
export type PermissionMode = 'ANY' | 'ALL';

/**
 * Marca uma rota como protegida por permissões (semântica OR — basta ter uma).
 * Use junto do PermissionsGuard, após o JwtAuthGuard. ROLE_ADMIN sempre passa.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSIONS_MODE_KEY, 'ANY'),
  );

/**
 * Variante de `RequirePermissions` com semântica AND — o caller precisa ter
 * TODAS as permissões listadas. ROLE_ADMIN sempre passa.
 */
export const RequireAllPermissions = (...permissions: PermissionKey[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSIONS_MODE_KEY, 'ALL'),
  );
