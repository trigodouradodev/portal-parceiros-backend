import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SimulateDto } from './simulate.dto';

describe('SimulateDto amount', () => {
  async function amountErrors(amount: unknown) {
    const dto = plainToInstance(SimulateDto, {
      name: 'Maria Souza',
      document: '52998224725',
      birthDate: '1990-05-20',
      email: 'maria@email.com',
      telephone: '11987654321',
      productId: '11111111-1111-4111-8111-111111111111',
      amount,
      installments: 10,
      firstInstallmentDate: '2026-09-10',
    });
    return (await validate(dto)).filter((error) => error.property === 'amount');
  }

  it.each([500, 600, 2100, 30000])(
    'accepts %s as a multiple of 100 reais',
    async (amount) => {
      expect(await amountErrors(amount)).toHaveLength(0);
    },
  );

  it.each([499, 30001, 500.5, 550, 2137, undefined, ''])(
    'rejects %s',
    async (amount) => {
      expect(await amountErrors(amount)).not.toHaveLength(0);
    },
  );
});
