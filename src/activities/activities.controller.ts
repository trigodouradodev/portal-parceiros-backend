import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { ActivitiesService } from './activities.service';
import { RegisterInteractionDto } from './dto/register-interaction.dto';
import { RegisterInteractionResult } from './interfaces/activity-interaction.interface';

@ApiTags('activities')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  /**
   * Registra o resultado de uma tarefa de cobrança. Conclui a tarefa, grava a
   * interação e cria a próxima tarefa da sequência do estágio (se houver).
   * Acesso: CONTRACT_FOLLOW_UP (ROLE_ADMIN por bypass). Autor = usuário logado.
   */
  @ApiOperation({
    summary:
      'Registrar resultado de uma tarefa de cobrança (cria a próxima da sequência).',
  })
  @ApiCreatedResponse({ type: RegisterInteractionResult })
  @ApiNotFoundResponse({ description: 'Tarefa não encontrada.' })
  @ApiConflictResponse({ description: 'Tarefa não está pendente.' })
  @RequirePermissions(PermissionKey.CONTRACT_FOLLOW_UP)
  @Post('tasks/:taskId/interactions')
  @HttpCode(HttpStatus.CREATED)
  registerInteraction(
    @CurrentUser('sub') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: RegisterInteractionDto,
  ) {
    return this.activitiesService.registerInteraction(taskId, userId, dto);
  }
}
