import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  DECLINE_NOTE_MAX_LENGTH,
  DeclineDraftQuoteDto,
} from './decline-draft-quote.dto';
import { QuoteDeclineReason } from '../enums/quote-decline-reason.enum';

// Mesma configuração do `main.ts`.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

function validate(body: Record<string, unknown>) {
  return pipe.transform(body, {
    type: 'body',
    metatype: DeclineDraftQuoteDto,
  });
}

describe('DeclineDraftQuoteDto', () => {
  it.each(Object.values(QuoteDeclineReason))(
    'aceita o motivo %s',
    async (reason) => {
      await expect(validate({ reason })).resolves.toMatchObject({ reason });
    },
  );

  it('aceita a observação opcional', async () => {
    await expect(
      validate({ reason: QuoteDeclineReason.OTHER, note: 'Mudou de cidade' }),
    ).resolves.toMatchObject({ note: 'Mudou de cidade' });
  });

  it.each([
    ['sem motivo', {}],
    ['motivo fora da lista', { reason: 'porque_sim' }],
    ['motivo vazio', { reason: '' }],
    ['observação que não é texto', { reason: 'no_contact', note: 123 }],
    [
      'observação acima do limite',
      { reason: 'no_contact', note: 'x'.repeat(DECLINE_NOTE_MAX_LENGTH + 1) },
    ],
    ['campo desconhecido', { reason: 'no_contact', status: 'approved' }],
  ])('rejeita %s', async (_label, body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aceita a observação no limite exato', async () => {
    await expect(
      validate({
        reason: 'no_contact',
        note: 'x'.repeat(DECLINE_NOTE_MAX_LENGTH),
      }),
    ).resolves.toBeDefined();
  });
});
