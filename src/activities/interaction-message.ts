import { ActivityInteractionResult } from './enums/activity.enums';
import { addCollectionDays } from './collection-calendar';
import type { CollectionExecutionContext } from './interfaces/collection-context.interface';

export function interactionMessage(
  result: ActivityInteractionResult,
  channel: string,
  context: CollectionExecutionContext,
): string {
  if (result === ActivityInteractionResult.RENEGOTIATION)
    return 'Negociação encaminhada ao backoffice. A cobrança fica suspensa enquanto a ação estiver pendente.';
  if (result === ActivityInteractionResult.DECEASED)
    return 'Óbito encaminhado ao backoffice para registro. A cobrança fica suspensa enquanto a ação estiver pendente.';
  if (result === ActivityInteractionResult.DISPUTE)
    return 'Contestação encaminhada ao backoffice. A cobrança fica suspensa enquanto a ação estiver pendente.';
  if (context.overdue_installment_count === 2)
    return 'Ação registrada. Acompanhamento das duas parcelas atrasadas concluído.';
  if (
    channel === 'visit' &&
    context.days_overdue > 5 &&
    [
      ActivityInteractionResult.NO_FORECAST,
      ActivityInteractionResult.NOT_LOCATED,
      ActivityInteractionResult.OTHER,
    ].includes(result)
  ) {
    const date = addCollectionDays(context.reference_date, 15)
      .split('-')
      .reverse()
      .join('/');
    return `Visita registrada. Nova cobrança a partir de ${date}, conforme a situação do contrato.`;
  }
  return 'Ação registrada.';
}
