import { ApiProperty } from '@nestjs/swagger';
import { SimulationSnapshot } from './simulation.interface';

/** Resultado da avaliação e execução de uma simulação. */
export class SimulateResult {
  @ApiProperty({
    example: true,
    description: 'Indica se o cliente passou pela etapa de elegibilidade.',
  })
  eligible: boolean;

  @ApiProperty({
    type: SimulationSnapshot,
    nullable: true,
    description: 'Simulação persistida; null quando o cliente é inelegível.',
  })
  simulation: SimulationSnapshot | null;
}
