import { ApiProperty } from '@nestjs/swagger';

/** Resultado da consulta de elegibilidade. */
export class EligibilityResult {
  @ApiProperty({
    example: true,
    description:
      'true se o CPF passou na validação cadastral. Nesta fatia, CPF com ' +
      'dígitos verificadores válidos. A Receita Federal entra depois, no ' +
      'mesmo campo.',
  })
  eligible: boolean;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({ example: '52998224725', description: 'CPF só com dígitos.' })
  document: string;

  @ApiProperty({ example: '1990-05-20', format: 'date' })
  birthDate: string;
}
