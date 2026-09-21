import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { ValidateEmailDto } from './dto/validate-email.dto';
import { EmailValidationRateLimiterService } from './email-validation-rate-limiter.service';
import { EmailValidationService } from './email-validation.service';
import { EmailValidationResult } from './interfaces/email-validation-result.interface';

@ApiTags('email-validation')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@RequirePermissions(PermissionKey.QUOTE_CREATE)
@Controller('email-validation')
export class EmailValidationController {
  constructor(
    private readonly emailValidation: EmailValidationService,
    private readonly rateLimiter: EmailValidationRateLimiterService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Verifica a entregabilidade de um e-mail via ZeroBounce. Nunca ' +
      'retorna erro por falha da integração — ver `checked` no resultado. ' +
      'Limitado por usuário pra proteger a cota paga, compartilhada com o ' +
      'trigo-connector.',
  })
  @ApiOkResponse({ type: EmailValidationResult })
  @ApiTooManyRequestsResponse({
    description: 'Muitas verificações de e-mail em pouco tempo.',
  })
  async validate(
    @Body() dto: ValidateEmailDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<EmailValidationResult> {
    if (!this.rateLimiter.consume(user.sub)) {
      throw new HttpException(
        'Muitas verificações de e-mail em pouco tempo. Tente novamente em alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.emailValidation.validate(dto.email);
  }
}
