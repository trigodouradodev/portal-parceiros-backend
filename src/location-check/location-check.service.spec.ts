import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationCheckService } from './location-check.service';
import {
  GeocodingService,
  GeocodeResult,
} from '../locations/geocoding.service';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyLocationDto } from './dto/verify-location.dto';
import { FollowUpParty } from '../follow-up/enums/follow-up.enums';

const CONTRACT_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '22222222-2222-2222-2222-222222222222';

/** Coordenada do endereço cadastrado usada como referência nos cenários. */
const REGISTERED = { latitude: -23.56321, longitude: -46.65412 };

const ADDRESS = {
  street: 'R. das Flores',
  number: '123',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  zip_code: '01001-000',
};

function geocodeResult(overrides: Partial<GeocodeResult> = {}): GeocodeResult {
  return {
    ...REGISTERED,
    formattedAddress: 'R. das Flores, 123 - Centro, São Paulo - SP, Brasil',
    locationType: 'ROOFTOP',
    partialMatch: false,
    ...overrides,
  };
}

interface BuildOptions {
  contract?: {
    id: string;
    client_id: string;
    quotes?: { guarantor: unknown } | null;
  } | null;
  installment?: { id: string } | null;
  address?: Partial<typeof ADDRESS> | null;
  geocode?: GeocodeResult | null;
  radiusMeters?: number | undefined;
  proximityRadiusMeters?: number | undefined;
}

async function build(options: BuildOptions = {}) {
  const {
    contract = { id: CONTRACT_ID, client_id: CLIENT_ID, quotes: null },
    installment = { id: 'installment-1' },
    address = ADDRESS,
    geocode = geocodeResult(),
    radiusMeters = 100,
    proximityRadiusMeters = 300,
  } = options;

  const prisma = {
    contracts: { findUnique: jest.fn().mockResolvedValue(contract) },
    installments: { findFirst: jest.fn().mockResolvedValue(installment) },
    addresses: {
      findFirst: jest
        .fn()
        .mockResolvedValue(address ? { ...ADDRESS, ...address } : null),
    },
  };
  const geocoding = { geocode: jest.fn().mockResolvedValue(geocode) };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'geocoding.radiusMeters') return radiusMeters;
      if (key === 'geocoding.proximityRadiusMeters')
        return proximityRadiusMeters;
      return undefined;
    }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LocationCheckService,
      { provide: PrismaService, useValue: prisma },
      { provide: GeocodingService, useValue: geocoding },
      { provide: ConfigService, useValue: config },
    ],
  }).compile();

  return { service: module.get(LocationCheckService), prisma, geocoding };
}

function dto(overrides: Partial<VerifyLocationDto> = {}): VerifyLocationDto {
  return {
    contractId: CONTRACT_ID,
    installmentNumber: 1,
    ...REGISTERED,
    ...overrides,
  };
}

describe('verify — pré-condições', () => {
  it('404 quando o contrato não existe', async () => {
    const { service } = await build({ contract: null });
    await expect(service.verify(dto())).rejects.toThrow(NotFoundException);
  });

  it('404 quando a parcela não existe no contrato', async () => {
    const { service } = await build({ installment: null });
    await expect(service.verify(dto())).rejects.toThrow(NotFoundException);
  });

  it('404 quando o cliente não tem endereço cadastrado', async () => {
    const { service } = await build({ address: null });
    await expect(service.verify(dto())).rejects.toThrow(NotFoundException);
  });

  it('não confirma quando o provedor não devolve ponto dentro do CEP', async () => {
    const { service } = await build({ geocode: null });
    const result = await service.verify(dto());

    expect(result.withinRadius).toBe(false);
    expect(result.addressLikelyWrong).toBe(true);
    expect(result.confirmationLevel).toBeNull();
    expect(result.locationType).toBe('UNAVAILABLE');
    expect(result.matchedAddress).toBe('');
  });

  it('para antes de geocodificar quando falta pré-condição', async () => {
    const { service, geocoding } = await build({ contract: null });
    await expect(service.verify(dto())).rejects.toThrow(NotFoundException);
    expect(geocoding.geocode).not.toHaveBeenCalled();
  });

  it('busca o endereço primário e, na falta, o mais recente', async () => {
    const { service, prisma } = await build();
    await service.verify(dto());

    const [args] = prisma.addresses.findFirst.mock.calls[0] as [
      { where: { client_id: string }; orderBy: unknown },
    ];
    expect(args.where.client_id).toBe(CLIENT_ID);
    expect(args.orderBy).toEqual([
      { is_primary: { sort: 'desc', nulls: 'last' } },
      { created_at: 'desc' },
    ]);
  });

  it('usa o endereço do avalista da proposta quando party é guarantor', async () => {
    const { service, prisma, geocoding } = await build({
      contract: {
        id: CONTRACT_ID,
        client_id: CLIENT_ID,
        quotes: {
          guarantor: {
            name: 'Avalista Teste',
            address: {
              streetName: 'Rua do Avalista',
              streetNumber: '77',
              streetDistrict: 'Centro',
              city: 'Salvador',
              state: 'BA',
              zipCode: '40000-000',
            },
          },
        },
      },
    });

    await service.verify(dto({ party: FollowUpParty.GUARANTOR }));

    expect(prisma.addresses.findFirst).not.toHaveBeenCalled();
    expect(geocoding.geocode).toHaveBeenCalledWith(
      'Rua do Avalista, 77, Centro, Salvador - BA, 40000-000, Brasil',
      { postalCode: '40000-000' },
    );
  });

  it('geocodifica o endereço do cliente em vez de ler coordenada da tabela', async () => {
    const { service, geocoding } = await build();

    await service.verify(dto());

    expect(geocoding.geocode).toHaveBeenCalledWith(
      'R. das Flores, 123, Centro, São Paulo - SP, 01001-000, Brasil',
      { postalCode: '01001-000' },
    );
  });
});

describe('verify — distância e raio', () => {
  it('distância zero quando a captura coincide com o endereço', async () => {
    const { service } = await build();
    const result = await service.verify(dto());

    expect(result.distanceMeters).toBe(0);
    expect(result.withinRadius).toBe(true);
  });

  it('calcula a distância por Haversine — 0,001° de latitude ≈ 111,2 m', async () => {
    const { service } = await build({ proximityRadiusMeters: 100 });
    const result = await service.verify(
      dto({ latitude: REGISTERED.latitude + 0.001 }),
    );

    expect(result.distanceMeters).toBeCloseTo(111.2, 1);
    expect(result.withinRadius).toBe(false);
  });

  it('arredonda a distância para uma casa decimal', async () => {
    const { service } = await build();
    const result = await service.verify(
      dto({ latitude: REGISTERED.latitude + 0.001 }),
    );

    expect(result.distanceMeters).toBe(
      Math.round(result.distanceMeters * 10) / 10,
    );
  });

  it('considera dentro do raio quando a distância é menor que ele', async () => {
    const { service } = await build({ radiusMeters: 100 });
    // 0,0005° de latitude ≈ 55,6 m.
    const result = await service.verify(
      dto({ latitude: REGISTERED.latitude + 0.0005 }),
    );

    expect(result.withinRadius).toBe(true);
  });

  describe('fronteira do raio', () => {
    // Distância exata para 0,0009° de latitude, calculada pela mesma fórmula.
    // Literal em vez de derivada da resposta: `distanceMeters` sai arredondado
    // para uma casa, então compará-lo com o raio testaria o arredondamento, e
    // não a fronteira.
    const EXACT_DISTANCE = 100.07543398026468;
    const OFFSET = { latitude: REGISTERED.latitude + 0.0009 };

    it('inclui a distância exatamente igual ao raio', async () => {
      const { service } = await build({
        radiusMeters: EXACT_DISTANCE,
        proximityRadiusMeters: EXACT_DISTANCE,
      });
      await expect(service.verify(dto(OFFSET))).resolves.toMatchObject({
        withinRadius: true,
        confirmationLevel: 'exact',
      });
    });

    it('exclui quando o raio é um fio menor que a distância', async () => {
      const { service } = await build({
        radiusMeters: 100.075,
        proximityRadiusMeters: 100.075,
      });
      await expect(service.verify(dto(OFFSET))).resolves.toMatchObject({
        withinRadius: false,
        confirmationLevel: null,
      });
    });
  });

  it('respeita o raio configurado, e não um valor fixo', async () => {
    const { service } = await build({
      radiusMeters: 15,
      proximityRadiusMeters: 15,
    });
    const result = await service.verify(
      dto({ latitude: REGISTERED.latitude + 0.0005 }),
    );

    expect(result.radiusMeters).toBe(15);
    expect(result.withinRadius).toBe(false);
  });

  it('cai para 100 m quando o raio não está configurado', async () => {
    const { service } = await build({ radiusMeters: undefined });
    const result = await service.verify(dto());

    expect(result.radiusMeters).toBe(100);
  });

  it('amplia o raio exato com a accuracy do GPS (teto 100 m)', async () => {
    const { service } = await build({ radiusMeters: 100 });
    // ~111 m — fora de 100 m, dentro de 100+25.
    const result = await service.verify(
      dto({
        latitude: REGISTERED.latitude + 0.001,
        accuracyMeters: 25,
      }),
    );

    expect(result.confirmationLevel).toBe('exact');
    expect(result.withinRadius).toBe(true);
    expect(result.effectiveRadiusMeters).toBe(125);
  });

  it('limita o bônus de accuracy a 100 m', async () => {
    const { service } = await build({ radiusMeters: 100 });
    const result = await service.verify(dto({ accuracyMeters: 500 }));

    expect(result.effectiveRadiusMeters).toBe(200);
  });

  it('confirma por proximidade na faixa intermediária', async () => {
    const { service } = await build({
      radiusMeters: 100,
      proximityRadiusMeters: 300,
    });
    // ~222 m — fora do raio exato, dentro da proximidade.
    const result = await service.verify(
      dto({ latitude: REGISTERED.latitude + 0.002 }),
    );

    expect(result.confirmationLevel).toBe('proximity');
    expect(result.withinRadius).toBe(true);
    expect(result.distanceMeters).toBeCloseTo(222.4, 0);
  });

  it('rejeita quando passa da faixa de proximidade', async () => {
    const { service } = await build({
      radiusMeters: 100,
      proximityRadiusMeters: 300,
    });
    // ~444 m.
    const result = await service.verify(
      dto({ latitude: REGISTERED.latitude + 0.004 }),
    );

    expect(result.confirmationLevel).toBeNull();
    expect(result.withinRadius).toBe(false);
  });
});

describe('verify — resposta', () => {
  it('ecoa as duas coordenadas e os metadados do geocoding', async () => {
    const { service } = await build({
      geocode: geocodeResult({
        locationType: 'APPROXIMATE',
        partialMatch: true,
      }),
    });
    const provided = { latitude: -23.5, longitude: -46.6 };
    const result = await service.verify(dto(provided));

    expect(result.registeredCoordinates).toEqual(REGISTERED);
    expect(result.providedCoordinates).toEqual(provided);
    expect(result.matchedAddress).toBe(
      'R. das Flores, 123 - Centro, São Paulo - SP, Brasil',
    );
    // Repassados para o caller decidir o quanto confiar no raio.
    expect(result.locationType).toBe('APPROXIMATE');
    expect(result.partialMatch).toBe(true);
  });

  it('responde 200 mesmo fora do raio — "fora" é resultado válido, não erro', async () => {
    const { service } = await build();
    await expect(
      service.verify(dto({ latitude: REGISTERED.latitude + 1 })),
    ).resolves.toMatchObject({ withinRadius: false });
  });
});

describe('verify — addressLikelyWrong (AUREA-352)', () => {
  it('false quando o endereço formatado cita a cidade cadastrada', async () => {
    const { service } = await build();
    const result = await service.verify(dto());

    expect(result.addressLikelyWrong).toBe(false);
  });

  it('true quando o endereço formatado não cita a cidade cadastrada — provável match errado', async () => {
    const { service } = await build({
      geocode: geocodeResult({
        formattedAddress: 'R. das Flores, 123 - Centro, Curitiba - PR, Brasil',
        locationType: 'RANGE_INTERPOLATED',
        partialMatch: true,
      }),
    });
    const result = await service.verify(dto());

    expect(result.addressLikelyWrong).toBe(true);
  });

  it('true quando locationType não é ROOFTOP, mesmo citando a cidade certa no texto', async () => {
    // Caso real reportado (AUREA-352): parceiro confirmadamente no endereço
    // certo (GPS bateu com o ponto real da via, verificado à parte via
    // OpenStreetMap) — Google devolveu RANGE_INTERPOLATED, com a cidade
    // certa no texto, mas errou o ponto por ~35km. A palavra do texto não
    // detecta esse tipo de erro; só o locationType detecta.
    const { service } = await build({
      geocode: geocodeResult({
        formattedAddress:
          "Rua Pau d'Arco, São Judas Tadeu, São Paulo - SP, Brasil",
        locationType: 'RANGE_INTERPOLATED',
        partialMatch: true,
      }),
    });
    const result = await service.verify(dto());

    expect(result.addressLikelyWrong).toBe(true);
  });

  it('true também para GEOMETRIC_CENTER e APPROXIMATE — só ROOFTOP é confiável', async () => {
    for (const locationType of ['GEOMETRIC_CENTER', 'APPROXIMATE']) {
      const { service } = await build({
        geocode: geocodeResult({ locationType }),
      });
      const result = await service.verify(dto());
      expect(result.addressLikelyWrong).toBe(true);
    }
  });

  it('compara sem diferenciar acentos ou caixa', async () => {
    const { service } = await build({
      address: { city: 'Jequié' },
      geocode: geocodeResult({
        formattedAddress: "Rua Pau d'Arco, 28 - JEQUIE - BA, Brasil",
      }),
    });
    const result = await service.verify(dto());

    expect(result.addressLikelyWrong).toBe(false);
  });

  it('não sinaliza como errado quando a cidade cadastrada está vazia — nada pra comparar', async () => {
    const { service } = await build({
      address: { city: '' },
      geocode: geocodeResult({
        formattedAddress: 'Endereço sem cidade reconhecível, Brasil',
      }),
    });
    const result = await service.verify(dto());

    expect(result.addressLikelyWrong).toBe(false);
  });
});

describe('verify — texto enviado ao geocoder', () => {
  async function textFor(address: Partial<typeof ADDRESS>): Promise<string> {
    const { service, geocoding } = await build({ address });
    await service.verify(dto());
    return (geocoding.geocode.mock.calls[0] as [string])[0];
  }

  it('monta logradouro, bairro, cidade-UF, CEP e país', async () => {
    await expect(textFor({})).resolves.toBe(
      'R. das Flores, 123, Centro, São Paulo - SP, 01001-000, Brasil',
    );
  });

  it('remove zeros à esquerda do número, que derrubam o ponto para a via', async () => {
    await expect(textFor({ number: '002539' })).resolves.toContain(
      'R. das Flores, 2539,',
    );
  });

  it('preserva o número zero, que não é zero à esquerda', async () => {
    await expect(textFor({ number: '0' })).resolves.toContain(
      'R. das Flores, 0,',
    );
  });

  it('omite o número quando ele vem vazio', async () => {
    await expect(textFor({ number: '' })).resolves.toBe(
      'R. das Flores, Centro, São Paulo - SP, 01001-000, Brasil',
    );
  });

  it('omite a UF quando o endereço não tem estado', async () => {
    await expect(textFor({ state: null })).resolves.toContain(
      'Centro, São Paulo, 01001-000',
    );
  });

  it('descarta partes vazias em vez de deixar vírgulas soltas', async () => {
    await expect(textFor({ neighborhood: '', zip_code: '   ' })).resolves.toBe(
      'R. das Flores, 123, São Paulo - SP, Brasil',
    );
  });
});
