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

describe('PartiesService.lookupByCpf', () => {
  it('retorna somente os dados básicos da pessoa encontrada', async () => {
    const { service, queryRaw } = buildService([
      [
        {
          id: PARTY_ID,
          name: 'Maria Souza',
          tax_id: '529.982.247-25',
          email: 'maria@email.com',
          phone: '+5511987654321',
        },
      ],
    ]);

    await expect(service.lookupByCpf('529.982.247-25')).resolves.toEqual({
      found: true,
      party: {
        name: 'Maria Souza',
        document: '52998224725',
        email: 'maria@email.com',
        telephone: '+5511987654321',
      },
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

    await expect(service.lookupByCpf('52998224725')).resolves.toEqual({
      found: false,
      party: null,
    });
  });

  it('rejeita CPF estruturalmente inválido antes de consultar o banco', async () => {
    const { service, queryRaw } = buildService();

    await expect(service.lookupByCpf('111.111.111-11')).rejects.toThrow(
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
        },
      ],
    ]);

    await expect(
      service.resolveForSimulation(
        {
          name: 'Nome digitado',
          document: '52998224725',
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
          email: ' MARIA@EMAIL.COM ',
          telephone: '(11) 98765-4321',
        },
        prisma as unknown as Prisma.TransactionClient,
      ),
    ).resolves.toBe(PARTY_ID);

    const [insertStrings] = queryRaw.mock.calls[1] as [TemplateStringsArray];
    expect(insertStrings.join(' ')).toContain('INSERT INTO public.clients');
    expect(queryRaw.mock.calls[1]).toEqual(
      expect.arrayContaining([
        'Maria Souza',
        '52998224725',
        'maria@email.com',
        '+5511987654321',
      ]),
    );
  });
});
