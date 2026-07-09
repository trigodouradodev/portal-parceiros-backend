import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Ponto de geolocalização capturado numa visita. */
export class InteractionGeolocation {
  @ApiProperty({ example: -23.55052 })
  latitude: number;

  @ApiProperty({ example: -46.633308 })
  longitude: number;
}

/** Interação registrada (resultado da execução de uma tarefa). */
export class ActivityInteractionResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  taskId: string;

  @ApiProperty()
  installmentId: string;

  @ApiProperty()
  contractId: string;

  @ApiProperty({
    example: 'contact',
    description: 'contact | visit (snapshot da tarefa).',
  })
  taskType: string;

  @ApiProperty({ example: 'whatsapp', description: 'whatsapp | call | visit.' })
  channel: string;

  @ApiProperty({
    example: 'client',
    description: 'client | guarantor | other.',
  })
  recipientType: string;

  @ApiPropertyOptional()
  recipientContactId?: string;

  @ApiProperty({ example: 'payment_promise' })
  result: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  promiseDate?: Date;

  @ApiPropertyOptional()
  observation?: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ type: InteractionGeolocation })
  geolocation?: InteractionGeolocation;
}

/** Resultado de registrar uma interação. Não cria próxima tarefa (só o job cria). */
export class RegisterInteractionResult {
  @ApiProperty({ type: ActivityInteractionResponse })
  interaction: ActivityInteractionResponse;
}

/** Estado da tarefa após uma ação (postergar / reagendar). */
export class TaskActionResult {
  @ApiProperty()
  id: string;

  @ApiProperty()
  installmentId: string;

  @ApiProperty()
  contractId: string;

  @ApiProperty({ example: 'mid' })
  segmentCode: string;

  @ApiProperty({ example: 'visit' })
  taskType: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Até quando a tarefa continua ativa.',
  })
  expireDate: Date;

  @ApiProperty()
  wasPostponed: boolean;

  @ApiProperty()
  wasRescheduled: boolean;
}
