import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateDraftSimulationDto } from './update-draft-simulation.dto';

// Mesma configuração do `main.ts`.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const valid = {
  productId: '11111111-1111-4111-8111-111111111111',
  amount: 8000,
  installments: 12,
  firstInstallmentDate: '2026-12-10',
};

function validate(body: Record<string, unknown>) {
  return pipe.transform(body, {
    type: 'body',
    metatype: UpdateDraftSimulationDto,
  });
}

describe('UpdateDraftSimulationDto (AUREA-701)', () => {
  it('aceita só as condições comerciais', async () => {
    await expect(validate(valid)).resolves.toMatchObject(valid);
  });

  it.each([
    'name',
    'document',
    'birthDate',
    'email',
    'telephone',
    'interestRate',
    'simulationId',
  ])(
    'recusa %s: dados do cliente e da cotação não mudam por aqui',
    async (field) => {
      await expect(validate({ ...valid, [field]: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('mantém as regras da simulação: valor múltiplo de 100 e dentro da faixa', async () => {
    await expect(validate({ ...valid, amount: 8050 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validate({ ...valid, amount: 40000 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
