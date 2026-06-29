import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterInteractionDto } from './dto/register-interaction.dto';
import {
  ActivityInteractionResponse,
  CreatedTaskResponse,
  RegisterInteractionResult,
} from './interfaces/activity-interaction.interface';
import {
  CreatedTaskRow,
  InteractionRow,
  TaskRow,
} from './interfaces/activity-row.interface';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra o resultado de uma tarefa de cobrança: marca a tarefa como
   * `completed`, grava a interação e **sempre** cria a próxima tarefa da
   * sequência do estágio (whatsapp → call → visit), se houver próximo canal.
   * Tudo numa transação, com `FOR UPDATE` na tarefa para evitar corrida.
   */
  async registerInteraction(
    taskId: string,
    userId: string,
    dto: RegisterInteractionDto,
  ): Promise<RegisterInteractionResult> {
    if (dto.promiseDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const promise = new Date(dto.promiseDate);
      if (Number.isNaN(promise.getTime())) {
        throw new BadRequestException('invalid_promise_date');
      }
      if (promise < today) {
        throw new BadRequestException('promise_date_in_past');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const taskRows = await tx.$queryRaw<TaskRow[]>`
        SELECT id, installment_id, contract_id, ruler_stage_id, stage_code, channel, status, assigned_to
        FROM activity_tasks
        WHERE id = ${taskId}::uuid
        FOR UPDATE
      `;
      const task = taskRows[0];
      if (!task) throw new NotFoundException('task_not_found');
      if (task.status !== 'pending') {
        throw new ConflictException('task_not_pending');
      }

      // 1. conclui a tarefa
      await tx.$executeRaw`
        UPDATE activity_tasks
        SET status = 'completed', completed_at = NOW(), completed_by_user_id = ${userId}::uuid
        WHERE id = ${taskId}::uuid
      `;

      // 2. grava a interação (1 por tarefa, garantido pelo UNIQUE(task_id))
      const interactionRows = await tx.$queryRaw<InteractionRow[]>`
        INSERT INTO activity_interactions
          (task_id, installment_id, contract_id, channel, result, promise_date, observation, user_id)
        VALUES
          (${taskId}::uuid, ${task.installment_id}::uuid, ${task.contract_id}::uuid, ${task.channel},
           ${dto.result}, ${dto.promiseDate ?? null}::date, ${dto.observation ?? null}, ${userId}::uuid)
        RETURNING id, task_id, installment_id, contract_id, channel, result, promise_date, observation, user_id, created_at
      `;
      const interaction = this.mapInteraction(interactionRows[0]);

      // 2b. se a visita trouxe geolocalização, grava o ponto vinculado à interação
      if (dto.latitude !== undefined && dto.longitude !== undefined) {
        await tx.$executeRaw`
          INSERT INTO geolocations (activity_interaction_id, latitude, longitude)
          VALUES (${interaction.id}::uuid, ${dto.latitude}, ${dto.longitude})
        `;
        interaction.geolocation = {
          latitude: dto.latitude,
          longitude: dto.longitude,
        };
      }

      // 3. cria a próxima tarefa da sequência (sempre, se houver próximo canal)
      const nextTask = await this.createNextTask(tx, task);

      return { interaction, nextTask };
    });
  }

  private async createNextTask(
    tx: Prisma.TransactionClient,
    task: TaskRow,
  ): Promise<CreatedTaskResponse | null> {
    if (!task.ruler_stage_id) return null;

    const nextRows = await tx.$queryRaw<{ channel: string }[]>`
      SELECT channel
      FROM activity_ruler_steps
      WHERE stage_id = ${task.ruler_stage_id}::uuid
        AND sort_order > (
          SELECT sort_order FROM activity_ruler_steps
          WHERE stage_id = ${task.ruler_stage_id}::uuid AND channel = ${task.channel}
        )
      ORDER BY sort_order ASC
      LIMIT 1
    `;
    const next = nextRows[0];
    if (!next) return null;

    const createdRows = await tx.$queryRaw<CreatedTaskRow[]>`
      INSERT INTO activity_tasks
        (installment_id, contract_id, ruler_stage_id, stage_code, channel, status, created_by, assigned_to, parent_task_id)
      VALUES
        (${task.installment_id}::uuid, ${task.contract_id}::uuid, ${task.ruler_stage_id}::uuid, ${task.stage_code},
         ${next.channel}, 'pending', 'system', ${task.assigned_to}::uuid, ${task.id}::uuid)
      RETURNING id, installment_id, contract_id, stage_code, channel, status, created_at
    `;
    const created = createdRows[0];
    return {
      id: created.id,
      installmentId: created.installment_id,
      contractId: created.contract_id,
      stageCode: created.stage_code,
      channel: created.channel,
      status: created.status,
      createdAt: created.created_at,
    };
  }

  private mapInteraction(row: InteractionRow): ActivityInteractionResponse {
    return {
      id: row.id,
      taskId: row.task_id,
      installmentId: row.installment_id,
      contractId: row.contract_id,
      channel: row.channel,
      result: row.result,
      promiseDate: row.promise_date ?? undefined,
      observation: row.observation ?? undefined,
      userId: row.user_id,
      createdAt: row.created_at,
    };
  }
}
