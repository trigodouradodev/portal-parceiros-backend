import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CustomerRelationshipDuration,
  CustomerRelationshipOrigin,
  PartnerAssessment,
} from '../enums/quote-partner-opinion.enum';
import { SaveQuotePartnerOpinionDto } from './save-quote-partner-opinion.dto';

const validOpinion = {
  relationshipDuration: CustomerRelationshipDuration.ONE_TO_3_YEARS,
  relationshipOrigin: CustomerRelationshipOrigin.IN_PERSON_PROSPECTING,
  assessment: PartnerAssessment.RECOMMEND,
  hasInformalDebtSigns: false,
  hasFinancialUrgencySigns: false,
  opinion: 'Cliente conhecido e com atividade estável.',
};

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(SaveQuotePartnerOpinionDto, input));
}

describe('SaveQuotePartnerOpinionDto', () => {
  it('aceita parecer sem campos condicionais', async () => {
    await expect(errors(validOpinion)).resolves.toHaveLength(0);
  });

  it('exige descrição quando a origem é Outros', async () => {
    expect(
      await errors({
        ...validOpinion,
        relationshipOrigin: CustomerRelationshipOrigin.OTHER,
      }),
    ).not.toHaveLength(0);
  });

  it('exige CPF quando a origem é indicação de cliente Áurea', async () => {
    expect(
      await errors({
        ...validOpinion,
        relationshipOrigin: CustomerRelationshipOrigin.AUREA_CUSTOMER_REFERRAL,
      }),
    ).not.toHaveLength(0);
  });

  it.each([
    { name: 'tempo inválido', changes: { relationshipDuration: 'invalid' } },
    { name: 'origem inválida', changes: { relationshipOrigin: 'invalid' } },
    { name: 'avaliação inválida', changes: { assessment: 'invalid' } },
    { name: 'sinal sem booleano', changes: { hasInformalDebtSigns: 'false' } },
    { name: 'parecer vazio', changes: { opinion: '' } },
  ])('recusa $name', async ({ changes }) => {
    expect(await errors({ ...validOpinion, ...changes })).not.toHaveLength(0);
  });
});
