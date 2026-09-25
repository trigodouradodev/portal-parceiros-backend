import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ActivityChannel,
  ActivityInteractionResult,
  ActivityRecipientType,
} from '../enums/activity.enums';
import { RegisterInteractionDto } from './register-interaction.dto';

const validInteraction = {
  channel: ActivityChannel.VISIT,
  recipientType: ActivityRecipientType.CLIENT,
  result: ActivityInteractionResult.NOT_LOCATED,
};

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(RegisterInteractionDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('RegisterInteractionDto — confirmação da visita', () => {
  it('aceita interação sem dados de localização', async () => {
    await expect(errors(validInteraction)).resolves.toHaveLength(0);
  });

  it('aceita confirmação exata sem motivo', async () => {
    await expect(
      errors({ ...validInteraction, locationConfirmation: 'exact' }),
    ).resolves.toHaveLength(0);
  });

  it('aceita confirmação manual com motivo', async () => {
    await expect(
      errors({
        ...validInteraction,
        locationConfirmation: 'manual',
        manualLocationReason: 'at_address_pin_wrong',
      }),
    ).resolves.toHaveLength(0);
  });

  it('recusa motivo que não existe mais', async () => {
    const result = await errors({
      ...validInteraction,
      locationConfirmation: 'manual',
      manualLocationReason: 'gps_imprecise',
    });

    expect(result.map((error) => error.property)).toContain(
      'locationConfirmation',
    );
  });

  it('recusa confirmação manual sem motivo', async () => {
    const result = await errors({
      ...validInteraction,
      locationConfirmation: 'manual',
    });

    expect(result.map((error) => error.property)).toContain(
      'locationConfirmation',
    );
  });

  it('recusa motivo fora da confirmação manual', async () => {
    const result = await errors({
      ...validInteraction,
      locationConfirmation: 'exact',
      manualLocationReason: 'device_unavailable',
    });

    expect(result.map((error) => error.property)).toContain(
      'locationConfirmation',
    );
  });

  it('recusa motivo sem o tipo da confirmação', async () => {
    const result = await errors({
      ...validInteraction,
      manualLocationReason: 'registered_address_wrong',
    });

    expect(result.map((error) => error.property)).toContain(
      'locationConfirmation',
    );
  });
});
