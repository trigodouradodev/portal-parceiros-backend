import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Inicia uma proposta draft a partir de uma simulação disponível. */
export class CreateDraftQuoteDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Simulação do parceiro que dará origem à proposta.',
  })
  @IsUUID()
  simulationId: string;
}
