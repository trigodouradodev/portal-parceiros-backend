import { ApiProperty } from '@nestjs/swagger';

/** Origem do responsável por uma parcela/cobrança. */
export enum ResponsibleType {
  COLLECTION_AGENT = 'COLLECTION_AGENT',
  CONSULTANT = 'CONSULTANT',
}

/**
 * Responsável pela cobrança: o agente de cobrança do contrato; na ausência,
 * cai para o consultor. `type` indica qual dos dois foi retornado. Compartilhado
 * entre as listagens (overdue/preventive) e o detalhe.
 */
export class ContractResponsible {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({
    enum: ResponsibleType,
    example: ResponsibleType.COLLECTION_AGENT,
  })
  type: ResponsibleType;
}
