import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { CheckEligibilityDto } from './dto/check-eligibility.dto';
import { EligibilityResult } from './interfaces/eligibility-result.interface';
import { EligibilityService } from './eligibility.service';

@ApiTags('eligibility')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('eligibility')
export class EligibilityController {
  constructor(private readonly eligibilityService: EligibilityService) {}

  @ApiOperation({
    summary: 'Consulta a elegibilidade do cliente (CPF + nome + nascimento).',
  })
  @ApiOkResponse({ type: EligibilityResult })
  @ApiBadRequestResponse({
    description: 'Payload malformado, nome vazio ou data inválida.',
  })
  @RequirePermissions(PermissionKey.QUOTE_CREATE)
  @Post()
  @HttpCode(HttpStatus.OK)
  check(@Body() dto: CheckEligibilityDto): Promise<EligibilityResult> {
    return this.eligibilityService.check(dto);
  }
}
