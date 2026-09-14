import { ApiProperty } from '@nestjs/swagger';
import { PartyLookupData } from '../../parties/interfaces/party-lookup-response.interface';

/** Resultado da consulta de elegibilidade. */
export class EligibilityResult {
  @ApiProperty({
    example: true,
    description:
      'Nesta fase, exige CPF com dígitos verificadores válidos e idade entre ' +
      '18 e 120 anos. A consulta cadastral da Receita Federal será incorporada ' +
      'posteriormente ao mesmo campo.',
  })
  eligible: boolean;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({ example: '52998224725', description: 'CPF só com dígitos.' })
  document: string;

  @ApiProperty({ example: '1990-05-20', format: 'date' })
  birthDate: string;

  @ApiProperty({
    type: PartyLookupData,
    nullable: true,
    description:
      'Dados básicos já conhecidos. Null quando inelegível ou cliente novo.',
  })
  party: PartyLookupData | null;
}
