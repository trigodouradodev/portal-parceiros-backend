import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { ProductOption } from './interfaces/product-option.interface';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({
    summary: 'Lista produtos vinculados ao usuário autenticado.',
  })
  @ApiOkResponse({ type: [ProductOption] })
  @RequirePermissions(
    PermissionKey.CONTRACT_VIEW,
    PermissionKey.CONTRACT_VIEW_ALL,
    PermissionKey.QUOTE_CREATE,
  )
  @Get()
  getProducts(@CurrentUser('sub') userId: string) {
    return this.productsService.getProducts(userId);
  }
}
