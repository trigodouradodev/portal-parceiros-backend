import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';

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

  @ApiProperty({ example: 'whatsapp_message' })
  channel: string;

  @ApiProperty({ example: 'no_return' })
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

/** Tarefa criada como próximo passo da sequência do estágio. */
export class CreatedTaskResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  installmentId: string;

  @ApiProperty()
  contractId: string;

  @ApiProperty({ example: 'warning' })
  stageCode: string;

  @ApiProperty({ example: 'client_call' })
  channel: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

@ApiExtraModels(CreatedTaskResponse)
export class RegisterInteractionResult {
  @ApiProperty({ type: ActivityInteractionResponse })
  interaction: ActivityInteractionResponse;

  @ApiProperty({
    nullable: true,
    allOf: [{ $ref: getSchemaPath(CreatedTaskResponse) }],
    description:
      'Próxima tarefa criada; null se a interação foi no último canal do estágio.',
  })
  nextTask: CreatedTaskResponse | null;
}
