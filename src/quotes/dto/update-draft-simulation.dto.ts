import { PickType } from '@nestjs/swagger';
import { SimulateDto } from '../../simulations/dto/simulate.dto';

/**
 * Novos dados comerciais de uma proposta em rascunho (AUREA-701). Mesmas regras
 * da simulação (faixa e múltiplo do valor, prazo, dia da primeira parcela). CPF
 * e dados pessoais não mudam aqui: ficam no passo Cadastro.
 */
export class UpdateDraftSimulationDto extends PickType(SimulateDto, [
  'productId',
  'amount',
  'installments',
  'firstInstallmentDate',
] as const) {}
