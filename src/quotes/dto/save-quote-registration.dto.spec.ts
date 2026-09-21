import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreditPurpose,
  EconomicActivityCategory,
  Gender,
  GovernmentProgram,
  HousingStatus,
  MaritalStatus,
  ResidenceDuration,
} from '../enums/quote-registration.enum';
import { SaveQuoteRegistrationDto } from './save-quote-registration.dto';

const validRegistration = {
  name: 'Maria Souza',
  document: '00820787264',
  birthDate: '1990-05-20',
  email: 'maria@email.com',
  telephone: '(11) 98765-4321',
  isRenegotiation: false,
  gender: Gender.FEMALE,
  secondaryDocument: '123456789',
  profession: 'Comerciante',
  economicActivityCategories: [EconomicActivityCategory.BUSINESS_OWNER],
  maritalStatus: MaritalStatus.SINGLE,
  childrenCount: 2,
  householdMembers: 4,
  housingStatus: HousingStatus.OWNED_PAID_OFF,
  residenceDuration: ResidenceDuration.MORE_THAN_5_YEARS,
  governmentPrograms: [GovernmentProgram.NONE],
  ownsVehicle: false,
  creditPurpose: CreditPurpose.BUSINESS_WORKING_CAPITAL,
};

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(SaveQuoteRegistrationDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('SaveQuoteRegistrationDto', () => {
  it('aceita os dados pessoais editáveis e o CPF somente informativo', async () => {
    await expect(errors(validRegistration)).resolves.toHaveLength(0);
  });

  it.each([
    { name: 'nome ausente', changes: { name: undefined } },
    { name: 'data fora do formato', changes: { birthDate: '20/05/1990' } },
    { name: 'e-mail inválido', changes: { email: 'maria' } },
    { name: 'telefone ausente', changes: { telephone: '' } },
  ])('recusa $name', async ({ changes }) => {
    expect(await errors({ ...validRegistration, ...changes })).not.toHaveLength(
      0,
    );
  });

  it.each([
    EconomicActivityCategory.CLT_EMPLOYEE,
    EconomicActivityCategory.PUBLIC_SERVANT,
    EconomicActivityCategory.RETIRED_OR_PENSIONER,
    EconomicActivityCategory.UNEMPLOYED,
  ])('exige profissão quando a atividade econômica é %s', async (category) => {
    await expect(
      errors({
        ...validRegistration,
        economicActivityCategories: [category],
        profession: undefined,
      }),
    ).resolves.not.toHaveLength(0);

    await expect(
      errors({
        ...validRegistration,
        economicActivityCategories: [category],
        profession: 'Recepcionista',
      }),
    ).resolves.toHaveLength(0);
  });

  it.each([
    EconomicActivityCategory.BUSINESS_OWNER,
    EconomicActivityCategory.SELF_EMPLOYED_OR_INFORMAL,
  ])(
    'não exige profissão quando a atividade econômica é %s — Subcategoria já descreve a atividade',
    async (category) => {
      await expect(
        errors({
          ...validRegistration,
          economicActivityCategories: [category],
          profession: undefined,
        }),
      ).resolves.toHaveLength(0);
    },
  );

  it('recusa (sem lançar exceção) quando economicActivityCategories não é um array', async () => {
    await expect(
      errors({
        ...validRegistration,
        economicActivityCategories: 'not-an-array',
      }),
    ).resolves.not.toHaveLength(0);
  });
});
