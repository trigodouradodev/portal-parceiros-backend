import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { CollectionsService } from './collections.service';
import { OverdueCollectionQueryDto } from './dto/overdue-collection-query.dto';

@Controller('installments/collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  /**
   * Aba Cobrança: lista paginada de contratos atrasados, do mais atrasado
   * para o menos. Acesso: INSTALLMENT_VIEW ou INSTALLMENT_VIEW_ALL (ROLE_ADMIN
   * por bypass); scope por hierarquia aplicado no service.
   */
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
  )
  @Get('overdue')
  getOverdue(
    @CurrentUser() user: JwtPayload,
    @Query() query: OverdueCollectionQueryDto,
  ) {
    return this.collectionsService.getOverdue(
      { userId: user.sub, permissions: user.permissions },
      query.page,
      query.limit,
    );
  }
}
