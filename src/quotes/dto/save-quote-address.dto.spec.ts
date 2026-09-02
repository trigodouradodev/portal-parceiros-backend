import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BrazilState } from '../../common/brazil-state.enum';
import { SaveQuoteAddressDto } from './save-quote-address.dto';

const validAddress = {
  zipCode: '01001-000',
  streetName: 'Praça da Sé',
  streetNumber: '100',
  streetDistrict: 'Sé',
  city: 'São Paulo',
  state: BrazilState.SP,
  referencePoint: 'Próximo à estação Sé',
};

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(SaveQuoteAddressDto, input));
}

describe('SaveQuoteAddressDto', () => {
  it('aceita endereço sem complemento e geolocalização', async () => {
    await expect(errors(validAddress)).resolves.toHaveLength(0);
  });

  it('aceita geolocalização válida', async () => {
    await expect(
      errors({
        ...validAddress,
        geolocation: {
          latitude: -23.55052,
          longitude: -46.633308,
          precision: '15m',
        },
      }),
    ).resolves.toHaveLength(0);
  });

  it.each([
    { name: 'CEP inválido', changes: { zipCode: '0100100' } },
    { name: 'UF inválida', changes: { state: 'XX' } },
    { name: 'ponto de referência ausente', changes: { referencePoint: '' } },
    {
      name: 'latitude fora do Brasil e do globo',
      changes: {
        geolocation: { latitude: -91, longitude: -46, precision: '15m' },
      },
    },
    {
      name: 'longitude inválida',
      changes: {
        geolocation: { latitude: -23, longitude: -181, precision: '15m' },
      },
    },
  ])('recusa $name', async ({ changes }) => {
    expect(await errors({ ...validAddress, ...changes })).not.toHaveLength(0);
  });
});
