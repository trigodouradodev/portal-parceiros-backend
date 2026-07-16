import { SetMetadata } from '@nestjs/common';

export const SELF_PARAM_KEY = 'selfParamName';

/**
 * Define qual parâmetro de rota carrega o id do "dono" do recurso. Combine
 * com o `SelfOrAdminGuard`: a requisição passa se o caller é ROLE_ADMIN ou se
 * o `sub` do JWT é igual ao valor desse parâmetro.
 *
 * Uso:
 *   @UseGuards(SelfOrAdminGuard)
 *   @SelfOrAdmin('managerId')
 *   @Get('manager/:managerId')
 */
export const SelfOrAdmin = (paramName: string) =>
  SetMetadata(SELF_PARAM_KEY, paramName);
