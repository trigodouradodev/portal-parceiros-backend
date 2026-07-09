import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

/** Payload para reagendar uma tarefa de VISITA (data ∈ [D+1, D+5], validado no service). */
export class RescheduleTaskDto {
  @ApiProperty({
    format: 'date',
    description: 'Nova data da visita (entre D+1 e D+5 a partir de hoje).',
  })
  @IsDateString()
  date: string;
}
