import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

describe('EligibilityService', () => {
  let service: EligibilityService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [EligibilityService],
    }).compile();
    service = module.get(EligibilityService);
  });

  it('devolve eligible true para CPF com DV válido, sem máscara no document', () => {
    expect(service.check(dto())).toEqual({
      eligible: true,
      name: 'Maria Souza',
      document: '52998224725',
      birthDate: '1990-05-20',
    });
  });

  it('aceita CPF já só com dígitos', () => {
    expect(service.check(dto({ document: '52998224725' })).document).toBe(
      '52998224725',
    );
  });

  it('trima o nome', () => {
    expect(service.check(dto({ name: '  Maria Souza  ' })).name).toBe(
      'Maria Souza',
    );
  });

  it('rejeita CPF com DV inválido', () => {
    expect(() => service.check(dto({ document: '123.456.789-00' }))).toThrow(
      BadRequestException,
    );
    expect(() => service.check(dto({ document: '123.456.789-00' }))).toThrow(
      'CPF inválido.',
    );
  });

  it('rejeita sequência de dígitos iguais', () => {
    expect(() => service.check(dto({ document: '111.111.111-11' }))).toThrow(
      'CPF inválido.',
    );
  });

  it('rejeita menor de 18', () => {
    expect(() => service.check(dto({ birthDate: yearsAgo(17) }))).toThrow(
      'O cliente deve ter entre 18 e 120 anos.',
    );
  });

  it('aceita 18 anos completos', () => {
    expect(service.check(dto({ birthDate: yearsAgo(18) })).eligible).toBe(true);
  });

  it('rejeita data de nascimento inválida', () => {
    expect(() => service.check(dto({ birthDate: '2026-02-30' }))).toThrow(
      'Data de nascimento inválida.',
    );
  });

  it('rejeita nome só com espaços depois do trim', () => {
    expect(() => service.check(dto({ name: '   ' }))).toThrow(
      'Informe o nome.',
    );
  });
});
