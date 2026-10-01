import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BrazilState } from '../../common/brazil-state.enum';
import { GuarantorRelationship } from '../enums/quote-guarantor.enum';
import { SaveQuoteGuarantorDto } from './save-quote-guarantor.dto';

const validGuarantor = {
  name: 'João Souza',
  document: '390.533.447-05',
  birthDate: '1988-03-15',
  email: 'joao@email.com',
  telephone: '(11) 98765-4321',
  address: {
    zipCode: '01001-000',
    streetName: 'Praça da Sé',
    streetNumber: '100',
    streetDistrict: 'Sé',
    city: 'São Paulo',
    state: BrazilState.SP,
  },
  relationship: GuarantorRelationship.SIBLING,
};

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(SaveQuoteGuarantorDto, input));
}

describe('SaveQuoteGuarantorDto', () => {
  it('aceita avalista sem complemento', async () => {
    await expect(errors(validGuarantor)).resolves.toHaveLength(0);
  });

  it.each([
    { name: 'nome vazio', changes: { name: '' } },
    { name: 'data fora do formato', changes: { birthDate: '15/03/1988' } },
    { name: 'e-mail inválido', changes: { email: 'joao' } },
    { name: 'telefone ausente', changes: { telephone: '' } },
    {
      name: 'endereço ausente',
      changes: { address: undefined },
    },
    {
      name: 'CEP inválido',
      changes: {
        address: { ...validGuarantor.address, zipCode: '0100100' },
      },
    },
    {
      name: 'UF inválida',
      changes: { address: { ...validGuarantor.address, state: 'XX' } },
    },
    { name: 'parentesco inválido', changes: { relationship: 'friend' } },
  ])('recusa $name', async ({ changes }) => {
    expect(await errors({ ...validGuarantor, ...changes })).not.toHaveLength(0);
  });
});
