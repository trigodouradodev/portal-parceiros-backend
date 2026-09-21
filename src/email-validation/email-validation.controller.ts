import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { ValidateEmailDto } from './dto/validate-email.dto';
import { EmailValidationService } from './email-validation.service';
import { EmailValidationResult } from './interfaces/email-validation-result.interface';

@ApiTags('email-validation')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@RequirePermissions(PermissionKey.QUOTE_CREATE)
@Controller('email-validation')
export class EmailValidationController {
  constructor(private readonly emailValidation: EmailValidationService) {}

  @Post()
  @ApiOperation({
    summary:
      'Verifica a entregabilidade de um e-mail via ZeroBounce. Nunca ' +
      'retorna erro por falha da integração — ver `checked` no resultado.',
  })
  @ApiOkResponse({ type: EmailValidationResult })
  validate(@Body() dto: ValidateEmailDto): Promise<EmailValidationResult> {
    return this.emailValidation.validate(dto.email);
  }
}
