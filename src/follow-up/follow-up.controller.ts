import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { FollowUpService } from './follow-up.service';

@ApiTags('follow-up')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('follow-up')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  /**
   * Registra um follow-up de parcela. Acesso: CONTRACT_FOLLOW_UP
   * (ROLE_ADMIN por bypass). O autor é o usuário autenticado.
   */
  @ApiOperation({ summary: 'Registrar follow-up de parcela.' })
  @ApiCreatedResponse({ description: 'Follow-up criado.' })
  @RequirePermissions(PermissionKey.CONTRACT_FOLLOW_UP)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateFollowUpDto) {
    return this.followUpService.create(userId, dto);
  }
}
