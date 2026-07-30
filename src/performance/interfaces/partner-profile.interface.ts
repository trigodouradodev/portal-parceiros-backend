import { ApiProperty } from '@nestjs/swagger';

/** Identidade do parceiro exibida na barra de topo da tela de Desempenho. */
export class PartnerIdentity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Roger Santos' })
  fullName: string;

  @ApiProperty({
    example: 'Agente de cobrança',
    nullable: true,
    description:
      'Cargo derivado das permissões ROLE_* do viewer. null quando ele não ' +
      'tem nenhuma — a tela omite o cargo em vez de exibir rótulo inventado.',
  })
  roleLabel: string | null;
}

/** Nível contratado do parceiro e os termos que ele define. */
export class PartnerLevel {
  @ApiProperty({
    example: 'GOLD',
    description: 'Chave estável do nível (`partner_levels.key`).',
  })
  key: string;

  @ApiProperty({
    example: 'Ouro',
    description: 'Rótulo de exibição do nível (`partner_levels.name`).',
  })
  label: string;

  @ApiProperty({
    example: 200000.0,
    description: 'Meta mensal de originação do nível (R$).',
  })
  monthlyTarget: number;

  @ApiProperty({ example: 8000.0, description: 'Fixo mensal do nível (R$).' })
  monthlyFixed: number;
}

/** Próximo marco da trilha de permanência a ser alcançado. */
export class NextPermanenceMilestone {
  @ApiProperty({
    example: 12,
    description: 'Mês de parceria em que o marco cai (6, 12 ou 18).',
  })
  month: number;

  @ApiProperty({
    example: 2,
    description: 'Multiplicador aplicado sobre o fixo mensal do nível.',
  })
  multiplier: number;

  @ApiProperty({
    example: 16000.0,
    description: 'Valor do marco: multiplicador × fixo mensal do nível (R$).',
  })
  amount: number;

  @ApiProperty({ example: 3, description: 'Meses restantes até o marco.' })
  monthsRemaining: number;
}

/** Posição do parceiro no tempo de programa. */
export class PartnershipStatus {
  @ApiProperty({
    example: '2025-11-15',
    description:
      "Início da parceria no formato 'YYYY-MM-DD'. É o primeiro " +
      '`effective_from` do parceiro, então não se move quando ele muda de nível.',
  })
  startedAt: string;

  @ApiProperty({
    example: 9,
    description:
      'Mês de parceria. Contado por mês calendário: o mês de entrada é o ' +
      'mês 1, independente do dia.',
  })
  monthNumber: number;

  @ApiProperty({
    example: false,
    description:
      'true apenas no 1º mês de parceria, quando cabe o bônus de boas-vindas.',
  })
  isFirstMonth: boolean;

  @ApiProperty({
    type: NextPermanenceMilestone,
    nullable: true,
    description:
      'Próximo marco a alcançar. null a partir do último marco — depois do ' +
      'mês 18 não há mais próximo marco. No mês exato de um marco ele já ' +
      'conta como atingido, e aqui aparece o marco seguinte.',
  })
  nextMilestone: NextPermanenceMilestone | null;
}

/** Resposta de `GET /performance/me`. */
export class PartnerProfile {
  @ApiProperty({ type: PartnerIdentity })
  partner: PartnerIdentity;

  @ApiProperty({ type: PartnerLevel })
  level: PartnerLevel;

  @ApiProperty({ type: PartnershipStatus })
  partnership: PartnershipStatus;
}
