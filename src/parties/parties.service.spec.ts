import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from './parties.service';

const PARTY_ID = '22222222-2222-4222-8222-222222222222';

function buildService(responses: unknown[][] = []) {
  const queryRaw = jest.fn();
  for (const response of responses) {
    queryRaw.mockResolvedValueOnce(response);
  }

  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return {
    service: new PartiesService(prisma),
    prisma,
    queryRaw,
  };
}

describe('PartiesService.findDataByCpf', () => {
  it('retorna somente os dados básicos da pessoa encontrada', async () => {
    const { service, queryRaw } = buildService([
      [
        {
          id: PARTY_ID,
          name: 'Maria Souza',
          tax_id: '529.982.247-25',
          email: 'maria@email.com',
          phone: '+5511987654321',
          birth_date: '1990-05-20',
        },
      ],
    ]);

    await expect(service.findDataByCpf('529.982.247-25')).resolves.toEqual({
      name: 'Maria Souza',
      document: '52998224725',
      birthDate: '1990-05-20',
      email: 'maria@email.com',
      telephone: '+5511987654321',
    });

    const [strings, document] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join(' ')).toContain('FROM public.parties');
    expect(document).toBe('52998224725');
  });

  it('trata pessoa não encontrada como resultado normal', async () => {
    const { service } = buildService([[]]);

    await expect(service.findDataByCpf('52998224725')).resolves.toBeNull();
  });

  it('rejeita CPF estruturalmente inválido antes de consultar o banco', async () => {
    const { service, queryRaw } = buildService();

    await expect(service.findDataByCpf('111.111.111-11')).rejects.toThrow(
      BadRequestException,
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('PartiesService.findFormDataByCpf', () => {
  it('retorna dados cadastrais e o endereço prioritário sem expor o ID', async () => {
    const { service, queryRaw } = buildService([
      [
        {
          id: PARTY_ID,
          name: 'Maria Souza',
          tax_id: '529.982.247-25',
          email: 'maria@email.com',
          phone: '+5511987654321',
          birth_date: '1990-05-20',
          address_street: 'Praça da Sé',
          address_number: '100',
          address_complement: null,
          address_neighborhood: 'Sé',
          address_city: 'São Paulo',
          address_state: 'sp',
          address_zip_code: '01001-000',
        },
      ],
    ]);

    await expect(service.findFormDataByCpf('529.982.247-25')).resolves.toEqual({
      name: 'Maria Souza',
      document: '52998224725',
      birthDate: '1990-05-20',
      email: 'maria@email.com',
      telephone: '+5511987654321',
      address: {
        zipCode: '01001000',
        streetName: 'Praça da Sé',
        streetNumber: '100',
        streetComplement: '',
        streetDistrict: 'Sé',
        city: 'São Paulo',
        state: 'SP',
      },
    });

    const [strings, document] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    const sql = strings.join(' ');
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain(
      'ORDER BY is_primary DESC NULLS LAST, created_at DESC, id DESC',
    );
    expect(document).toBe('52998224725');
  });

  it('retorna a pessoa com endereço nulo quando não há endereço cadastrado', async () => {
    const { service } = buildService([
      [
        {
          id: PARTY_ID,
          name: 'Maria Souza',
          tax_id: '52998224725',
          email: null,
          phone: null,
          birth_date: null,
          address_street: null,
          address_number: null,
          address_complement: null,
          address_neighborhood: null,
          address_city: null,
          address_state: null,
          address_zip_code: null,
        },
      ],
    ]);

    await expect(service.findFormDataByCpf('52998224725')).resolves.toEqual({
      name: 'Maria Souza',
      document: '52998224725',
      birthDate: null,
      email: null,
      telephone: null,
      address: null,
    });
  });

  it('trata pessoa não encontrada como resultado normal', async () => {
    const { service } = buildService([[]]);

    await expect(service.findFormDataByCpf('52998224725')).resolves.toBeNull();
  });

  it('rejeita CPF inválido antes de consultar o banco', async () => {
    const { service, queryRaw } = buildService();

    await expect(service.findFormDataByCpf('11111111111')).rejects.toThrow(
      BadRequestException,
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('PartiesService.resolveForSimulation', () => {
  it('reutiliza a party existente sem alterar os dados canônicos', async () => {
    const { service, prisma, queryRaw } = buildService([
      [
        {
          id: PARTY_ID,
          name: 'Nome canônico',
          tax_id: '52998224725',
          email: null,
          phone: null,
          birth_date: '1985-02-10',
        },
      ],
    ]);

    await expect(
      service.resolveForSimulation(
        {
          name: 'Nome digitado',
          document: '52998224725',
          birthDate: new Date('1990-05-20T00:00:00.000Z'),
          email: 'novo@email.com',
          telephone: '11987654321',
        },
        prisma as unknown as Prisma.TransactionClient,
      ),
    ).resolves.toBe(PARTY_ID);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [lookupStrings] = queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(lookupStrings.join(' ')).toContain('FROM public.parties');
  });

  it('preenche a data de nascimento ausente sem sobrescrever outros dados', async () => {
    const { service, prisma, queryRaw } = buildService([
      [
        {
          id: PARTY_ID,
          name: 'Nome canônico',
          tax_id: '52998224725',
          email: null,
          phone: null,
          birth_date: null,
        },
      ],
      [{ id: PARTY_ID }],
    ]);

    await expect(
      service.resolveForSimulation(
        {
          name: 'Nome digitado',
          document: '52998224725',
          birthDate: new Date('1990-05-20T00:00:00.000Z'),
          email: 'novo@email.com',
          telephone: '11987654321',
        },
        prisma as unknown as Prisma.TransactionClient,
      ),
    ).resolves.toBe(PARTY_ID);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    const updateCall = queryRaw.mock.calls[1] as [
      TemplateStringsArray,
      string,
      string,
    ];
    const updateSql = updateCall[0].join(' ');
    expect(updateSql).toContain('UPDATE public.clients');
    expect(updateSql).toContain('AND birth_date IS NULL');
    expect(updateCall).toContain('1990-05-20');
    expect(updateCall).toContain(PARTY_ID);
  });

  it('cria a identidade pelo caminho transitório de clients', async () => {
    const { service, prisma, queryRaw } = buildService([
      [],
      [{ id: PARTY_ID }],
    ]);

    await expect(
      service.resolveForSimulation(
        {
          name: ' Maria Souza ',
          document: '529.982.247-25',
          birthDate: new Date('1990-05-20T00:00:00.000Z'),
          email: ' MARIA@EMAIL.COM ',
          telephone: '(11) 98765-4321',
        },
        prisma as unknown as Prisma.TransactionClient,
      ),
    ).resolves.toBe(PARTY_ID);

    const [insertStrings] = queryRaw.mock.calls[1] as [TemplateStringsArray];
    expect(insertStrings.join(' ')).toContain('INSERT INTO public.clients');
    expect(insertStrings.join(' ')).toContain('birth_date');
    expect(queryRaw.mock.calls[1]).toEqual(
      expect.arrayContaining([
        'Maria Souza',
        '52998224725',
        'maria@email.com',
        '+5511987654321',
        '1990-05-20',
      ]),
    );
  });
});
