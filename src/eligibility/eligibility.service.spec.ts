import { BadRequestException } from '@nestjs/common';
import { PartiesService } from '../parties/parties.service';
import { CheckEligibilityDto } from './dto/check-eligibility.dto';
import { EligibilityService } from './eligibility.service';

function yearsAgo(years: number, extraDays = 0): string {
  const today = new Date();
  const date = new Date(
    Date.UTC(
      today.getUTCFullYear() - years,
      today.getUTCMonth(),
      today.getUTCDate() + extraDays,
    ),
  );
  return date.toISOString().slice(0, 10);
}

function dto(
  overrides: Partial<CheckEligibilityDto> = {},
): CheckEligibilityDto {
  return {
    name: 'Maria Souza',
    document: '529.982.247-25',
    birthDate: '1990-05-20',
    ...overrides,
  };
}

function buildService(party: unknown = null) {
  const findDataByCpf = jest.fn().mockResolvedValue(party);
  const partiesService = { findDataByCpf } as unknown as PartiesService;

  return {
    service: new EligibilityService(partiesService),
    findDataByCpf,
  };
}

describe('EligibilityService', () => {
  it('retorna elegibilidade e os dados existentes da party', async () => {
    const party = {
      name: 'Maria canônica',
      document: '52998224725',
      email: 'maria@email.com',
      telephone: '+5511987654321',
    };
    const { service, findDataByCpf } = buildService(party);

    await expect(service.check(dto())).resolves.toEqual({
      eligible: true,
      name: 'Maria Souza',
      document: '52998224725',
      birthDate: '1990-05-20',
      party,
    });
    expect(findDataByCpf).toHaveBeenCalledWith('52998224725');
  });

  it('retorna party null quando o cliente elegível ainda não existe', async () => {
    const { service } = buildService();

    await expect(service.check(dto())).resolves.toMatchObject({
      eligible: true,
      party: null,
    });
  });

  it('retorna inelegível para CPF com DV inválido sem consultar parties', async () => {
    const { service, findDataByCpf } = buildService();

    await expect(
      service.check(dto({ document: '123.456.789-00' })),
    ).resolves.toMatchObject({
      eligible: false,
      document: '12345678900',
      party: null,
    });
    expect(findDataByCpf).not.toHaveBeenCalled();
  });

  it('retorna inelegível para sequência de dígitos iguais', async () => {
    const { service, findDataByCpf } = buildService();

    await expect(
      service.check(dto({ document: '111.111.111-11' })),
    ).resolves.toMatchObject({ eligible: false, party: null });
    expect(findDataByCpf).not.toHaveBeenCalled();
  });

  it('retorna inelegível para menor de 18 sem consultar parties', async () => {
    const { service, findDataByCpf } = buildService();

    await expect(
      service.check(dto({ birthDate: yearsAgo(17) })),
    ).resolves.toMatchObject({ eligible: false, party: null });
    expect(findDataByCpf).not.toHaveBeenCalled();
  });

  it('aceita idade entre 18 e 120 anos, inclusive', async () => {
    const { service } = buildService();

    await expect(
      service.check(dto({ birthDate: yearsAgo(18) })),
    ).resolves.toMatchObject({ eligible: true });
    await expect(
      service.check(dto({ birthDate: yearsAgo(120) })),
    ).resolves.toMatchObject({ eligible: true });
  });

  it('rejeita data de nascimento inválida', async () => {
    const { service } = buildService();

    await expect(
      service.check(dto({ birthDate: '2026-02-30' })),
    ).rejects.toThrow('Data de nascimento inválida.');
  });

  it('rejeita nome só com espaços depois do trim', async () => {
    const { service } = buildService();

    await expect(service.check(dto({ name: '   ' }))).rejects.toThrow(
      BadRequestException,
    );
  });
});
