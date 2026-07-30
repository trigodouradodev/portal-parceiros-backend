import { ApiProperty } from '@nestjs/swagger';
import { PartnerLevel } from './partner-profile.interface';

/**
 * Pilares de bônus de performance. Valores espelham exatamente o CHECK
 * `partner_bonus_bands_pillar_check` da tabela `partner_bonus_bands`.
 *
 * Os três são independentes e somados, cada um como % sobre o fixo mensal do
 * nível. A grandeza comparada muda por pilar, mas é sempre percentual:
 *   - DISBURSEMENT: quanto da meta mensal foi originado (ex.: 115 = 115% da meta)
 *   - RISK: inadimplência da carteira (ex.: 3.2 = 3,2%)
 *   - RATE: taxa média praticada nas operações (ex.: 9.8 = 9,8%)
 */
export enum BonusPillar {
  DISBURSEMENT = 'DISBURSEMENT',
  RISK = 'RISK',
  RATE = 'RATE',
}

/**
 * Faixa de bônus: um intervalo de valores e o bônus que ele destrava.
 *
 * Os dois flags de inclusividade existem porque cada pilar fecha o intervalo de
 * um lado diferente — desembolso e taxa fecham à esquerda, risco à direita. Eles
 * também permitem a faixa de ponto único `[9.5 , 9.5]` da taxa média, que é
 * intencional no modelo comercial (taxa exatamente 9,5% → +10%).
 */
export class BonusBand {
  @ApiProperty({ example: 100.0, description: 'Limite inferior da faixa.' })
  minValue: number;

  @ApiProperty({
    example: true,
    description: 'true se `minValue` pertence à faixa (fronteira fechada).',
  })
  minInclusive: boolean;

  @ApiProperty({
    example: 110.0,
    nullable: true,
    description: 'Limite superior da faixa. null = sem teto (infinito).',
  })
  maxValue: number | null;

  @ApiProperty({
    example: false,
    description: 'true se `maxValue` pertence à faixa (fronteira fechada).',
  })
  maxInclusive: boolean;

  @ApiProperty({
    example: 10.0,
    description: 'Bônus da faixa, em % sobre o fixo mensal do nível.',
  })
  bonusPercent: number;
}

/** Réguas de um pilar, em ordem crescente de valor. */
export class BonusPillarBands {
  @ApiProperty({ enum: BonusPillar, example: BonusPillar.DISBURSEMENT })
  pillar: BonusPillar;

  @ApiProperty({
    type: [BonusBand],
    description:
      'Faixas contíguas cobrindo de 0 ao infinito, sem buraco nem ' +
      'sobreposição — validado a cada leitura.',
  })
  bands: BonusBand[];
}

/** Marco da trilha de permanência. */
export class ProgramMilestone {
  @ApiProperty({ example: 12, description: 'Mês de parceria do marco.' })
  month: number;

  @ApiProperty({
    example: 2,
    description:
      'Multiplicador sobre o fixo mensal do nível. O valor pago no marco é ' +
      'multiplicador × fixo, uma única vez no mês em que o marco cai.',
  })
  multiplier: number;
}

/**
 * Resposta de `GET /performance/program` — os parâmetros do Programa de
 * Parceiros Exclusivos como dado.
 *
 * Existe pra que o simulador do front avalie as MESMAS faixas que o cálculo real
 * do backend usa. Sem isso, as fronteiras (inclusive a de ponto único da taxa)
 * ficariam hardcoded em dois repositórios, livres para divergir.
 */
export class PartnerProgram {
  @ApiProperty({
    example: 4000.0,
    description:
      'Bônus de boas-vindas (R$), pago uma única vez no 1º mês de parceria e ' +
      'igual para todos os níveis. Vem da config ' +
      '`PERFORMANCE_WELCOME_BONUS_AMOUNT`.',
  })
  welcomeBonusAmount: number;

  @ApiProperty({
    type: [PartnerLevel],
    description:
      'Níveis ativos em ordem crescente de meta — base da tabela comparativa.',
  })
  levels: PartnerLevel[];

  @ApiProperty({ type: [BonusPillarBands] })
  bonusPillars: BonusPillarBands[];

  @ApiProperty({ type: [ProgramMilestone] })
  permanenceMilestones: ProgramMilestone[];
}
