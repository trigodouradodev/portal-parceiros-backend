import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { ActivitiesService } from './activities.service';
import { RegisterInteractionDto } from './dto/register-interaction.dto';
import { RescheduleTaskDto } from './dto/reschedule-task.dto';
import { TodayQueueQueryDto } from './dto/today-queue-query.dto';
import {
  RegisterInteractionResult,
  TaskActionResult,
} from './interfaces/activity-interaction.interface';
import { TodayQueue } from './interfaces/task-queue.interface';
import { InstallmentDetail } from './interfaces/installment-detail.interface';
import { SubordinateOption } from './interfaces/subordinate-option.interface';

@ApiTags('activities')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
@ApiForbiddenResponse({ description: 'Permissão insuficiente.' })
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  /**
   * Fila "Ações de hoje" do usuário ou de um subordinado selecionado: active
   * (#1) / locked / scheduled / completedToday + counter. Ordenada por
   * prioridade do segmento e maior atraso.
   */
  @ApiOperation({
    summary:
      'Fila de cobrança do dia (home) do usuário ou de um subordinado selecionado.',
  })
  @ApiOkResponse({ type: TodayQueue })
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
    PermissionKey.ROLE_BACKOFFICE,
  )
  @Get('tasks/today')
  getTodayQueue(
    @CurrentUser() user: JwtPayload,
    @Query() query: TodayQueueQueryDto,
  ) {
    return this.activitiesService.getTodayQueue(
      { userId: user.sub, permissions: user.permissions },
      query.page,
      query.limit,
      query.assignedToId,
    );
  }

  @ApiOperation({
    summary:
      'Lista responsáveis para filtrar a fila (subárvore ou parceiros do rollout para admin/backoffice).',
  })
  @ApiOkResponse({ type: [SubordinateOption] })
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
    PermissionKey.ROLE_BACKOFFICE,
  )
  @Get('subordinates')
  getSubordinates(@CurrentUser() user: JwtPayload) {
    return this.activitiesService.getSubordinates({
      userId: user.sub,
      permissions: user.permissions,
    });
  }

  /**
   * Detalhe da parcela: contrato, cliente, responsável e o histórico completo de tarefas
   * da parcela (cada uma com sua interação). Escopado pela hierarquia do usuário.
   */
  @ApiOperation({
    summary:
      'Detalhe da parcela (contrato, cliente, responsável, histórico de tarefas + interações).',
  })
  @ApiOkResponse({ type: InstallmentDetail })
  @ApiNotFoundResponse({
    description: 'Parcela não encontrada ou fora do escopo.',
  })
  @RequirePermissions(
    PermissionKey.INSTALLMENT_VIEW,
    PermissionKey.INSTALLMENT_VIEW_ALL,
    PermissionKey.ROLE_BACKOFFICE,
  )
  @Get('installments/:installmentId')
  getInstallmentDetail(
    @CurrentUser() user: JwtPayload,
    @Param('installmentId', ParseUUIDPipe) installmentId: string,
  ) {
    return this.activitiesService.getInstallmentDetail(installmentId, {
      userId: user.sub,
      permissions: user.permissions,
    });
  }

  /**
   * Registra o resultado de uma tarefa de cobrança: conclui a tarefa e grava a
   * interação (o job diário cria a próxima). Só na tarefa #1 ativa da fila.
   */
  @ApiOperation({ summary: 'Registrar resultado de uma tarefa de cobrança.' })
  @ApiCreatedResponse({ type: RegisterInteractionResult })
  @ApiBadRequestResponse({
    description: 'Payload inválido para o tipo da tarefa.',
  })
  @ApiNotFoundResponse({ description: 'Tarefa não encontrada.' })
  @ApiConflictResponse({
    description: 'Tarefa não está pendente ou não é a ativa da fila.',
  })
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

  /** Posterga a tarefa ativa para amanhã (1× por tarefa). */
  @ApiOperation({ summary: 'Postergar a tarefa ativa para amanhã (1×).' })
  @ApiOkResponse({ type: TaskActionResult })
  @ApiNotFoundResponse({ description: 'Tarefa não encontrada.' })
  @ApiConflictResponse({
    description: 'Tarefa não ativa/pendente ou já postergada.',
  })
  @RequirePermissions(PermissionKey.CONTRACT_FOLLOW_UP)
  @Post('tasks/:taskId/postpone')
  @HttpCode(HttpStatus.OK)
  postpone(
    @CurrentUser('sub') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.activitiesService.postpone(taskId, userId);
  }

  /** Reagenda uma tarefa de VISITA para [D+1, D+5] (até 2× por tarefa). */
  @ApiOperation({ summary: 'Reagendar a visita ativa para D+1..D+5 (até 2×).' })
  @ApiOkResponse({ type: TaskActionResult })
  @ApiBadRequestResponse({
    description: 'Não é visita ou data fora da janela.',
  })
  @ApiNotFoundResponse({ description: 'Tarefa não encontrada.' })
  @ApiConflictResponse({
    description:
      'Tarefa não ativa/pendente ou limite de reagendamentos atingido.',
  })
  @RequirePermissions(PermissionKey.CONTRACT_FOLLOW_UP)
  @Post('tasks/:taskId/reschedule')
  @HttpCode(HttpStatus.OK)
  reschedule(
    @CurrentUser('sub') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: RescheduleTaskDto,
  ) {
    return this.activitiesService.reschedule(taskId, userId, dto);
  }
}
