import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

const UPDATED_USER = {
  id: USER_ID,
  email: 'novo@trigodourado.com',
  full_name: 'Maria Souza',
  phone_number: '11987654321',
};

interface BuildOptions {
  /** Linha devolvida ao checar se o usuário existe dentro da transação. */
  existing?: { id: string } | null;
  /** Linha devolvida ao checar se o email já está em uso por outro usuário. */
  emailTaken?: { id: string } | null;
  /** Erro lançado pelo UPDATE em trigo_users. */
  updateError?: Error;
}

function createTx(options: BuildOptions) {
  const {
    existing = { id: USER_ID },
    emailTaken = null,
    updateError,
  } = options;
  let findFirstCall = 0;

  return {
    trigo_users: {
      // 1ª chamada: existência do usuário. 2ª: email já em uso por outro.
      findFirst: jest.fn(() => {
        findFirstCall += 1;
        return Promise.resolve(findFirstCall === 1 ? existing : emailTaken);
      }),
      update: jest.fn(() =>
        updateError
          ? Promise.reject(updateError)
          : Promise.resolve(UPDATED_USER),
      ),
    },
    consultants: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    collection_agents: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

type Tx = ReturnType<typeof createTx>;

async function build(options: BuildOptions = {}) {
  const tx = createTx(options);
  const prisma = {
    $transaction: jest.fn((fn: (client: Tx) => unknown) => fn(tx)),
    permissions: { findMany: jest.fn().mockResolvedValue([]) },
    trigo_users: {
      findUnique: jest.fn().mockResolvedValue(UPDATED_USER),
      update: jest.fn().mockResolvedValue(UPDATED_USER),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [UsersService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get(UsersService), prisma, tx };
}

describe('updateProfile — validação de entrada', () => {
  it('400 quando nenhum campo é enviado', async () => {
    const { service, prisma } = await build();
    await expect(service.updateProfile(USER_ID, {})).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('normaliza o email para minúsculas e sem espaços', async () => {
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { email: '  Novo@Trigo.com  ' });

    const [args] = tx.trigo_users.update.mock.calls[0] as [
      { data: { email: string } },
    ];
    expect(args.data.email).toBe('novo@trigo.com');
  });

  it('apara o nome completo', async () => {
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { fullName: '  Maria Souza  ' });

    const [args] = tx.trigo_users.update.mock.calls[0] as [
      { data: { full_name: string } },
    ];
    expect(args.data.full_name).toBe('Maria Souza');
  });
});

describe('updateProfile — telefone: limpar vs. não tocar', () => {
  it('grava null quando o telefone é enviado como null — é limpar', async () => {
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { phoneNumber: null });

    const [args] = tx.trigo_users.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(args.data).toHaveProperty('phone_number', null);
  });

  it('nem inclui o campo quando o telefone não é enviado — é não tocar', async () => {
    // A distinção entre null e undefined é o motivo de o service não usar `?.`
    // aqui; um encadeamento opcional colapsaria os dois casos.
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { fullName: 'Maria' });

    const [args] = tx.trigo_users.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(args.data).not.toHaveProperty('phone_number');
  });
});

describe('updateProfile — conflitos de email', () => {
  it('409 quando outro usuário já tem o email', async () => {
    const { service } = await build({ emailTaken: { id: 'outro-user' } });
    await expect(
      service.updateProfile(USER_ID, { email: 'ocupado@trigo.com' }),
    ).rejects.toThrow(ConflictException);
  });

  it('checa o email sem filtrar soft delete', async () => {
    // O índice único de trigo_users.email é do banco e não conhece is_deleted:
    // um usuário deletado segurando o email faria o UPDATE estourar depois.
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { email: 'novo@trigo.com' });

    const [args] = tx.trigo_users.findFirst.mock.calls[1] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where).not.toHaveProperty('is_deleted');
    expect(args.where).toMatchObject({ id: { not: USER_ID } });
  });

  it('compara o email sem diferenciar caixa', async () => {
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { email: 'novo@trigo.com' });

    const [args] = tx.trigo_users.findFirst.mock.calls[1] as [
      { where: { email: { mode: string } } },
    ];
    expect(args.where.email.mode).toBe('insensitive');
  });

  it('não checa duplicidade quando o email não está sendo alterado', async () => {
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { fullName: 'Maria' });

    // Só a checagem de existência do usuário.
    expect(tx.trigo_users.findFirst).toHaveBeenCalledTimes(1);
  });

  it('409 quando o UNIQUE de um perfil legado estoura no espelhamento', async () => {
    // consultants.email tem UNIQUE próprio: pode colidir com o perfil legado de
    // OUTRO usuário mesmo com trigo_users limpo. A transação inteira reverte.
    const { service } = await build({
      updateError: new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    });

    await expect(
      service.updateProfile(USER_ID, { email: 'novo@trigo.com' }),
    ).rejects.toThrow(ConflictException);
  });

  it('propaga erros que não são de duplicidade', async () => {
    const { service } = await build({
      updateError: new Error('falha de rede'),
    });
    await expect(
      service.updateProfile(USER_ID, { fullName: 'Maria' }),
    ).rejects.toThrow('falha de rede');
  });
});

describe('updateProfile — usuário inválido', () => {
  it('401 quando o usuário não existe ou está deletado', async () => {
    const { service, tx } = await build({ existing: null });
    await expect(
      service.updateProfile(USER_ID, { fullName: 'Maria' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tx.trigo_users.update).not.toHaveBeenCalled();
  });
});

describe('updateProfile — espelhamento nos perfis legados', () => {
  it('replica os campos em consultants e collection_agents', async () => {
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, {
      email: 'novo@trigo.com',
      fullName: 'Maria Souza',
      phoneNumber: '11999998888',
    });

    const esperado = {
      where: { user_id: USER_ID },
      data: {
        email: 'novo@trigo.com',
        name: 'Maria Souza',
        phone_number: '11999998888',
      },
    };
    expect(tx.consultants.updateMany).toHaveBeenCalledWith(esperado);
    expect(tx.collection_agents.updateMany).toHaveBeenCalledWith(esperado);
  });

  it('traduz fullName para a coluna name dos perfis legados', async () => {
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { fullName: 'Maria Souza' });

    const [args] = tx.consultants.updateMany.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(args.data).toEqual({ name: 'Maria Souza' });
  });

  it('espelha só o que mudou', async () => {
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { phoneNumber: '11999998888' });

    const [args] = tx.consultants.updateMany.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(args.data).toEqual({ phone_number: '11999998888' });
  });

  it('espelha a limpeza do telefone', async () => {
    const { service, tx } = await build();
    await service.updateProfile(USER_ID, { phoneNumber: null });

    const [args] = tx.consultants.updateMany.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(args.data).toEqual({ phone_number: null });
  });
});

describe('getPermissionKeys', () => {
  it('devolve só as chaves', async () => {
    const { service, prisma } = await build();
    prisma.permissions.findMany.mockResolvedValue([
      { permission_key: 'CONTRACT_VIEW' },
      { permission_key: 'INSTALLMENT_VIEW' },
    ]);

    await expect(service.getPermissionKeys(USER_ID)).resolves.toEqual([
      'CONTRACT_VIEW',
      'INSTALLMENT_VIEW',
    ]);
  });

  it('devolve vazio para usuário sem grupo', async () => {
    const { service } = await build();
    await expect(service.getPermissionKeys(USER_ID)).resolves.toEqual([]);
  });

  it('considera apenas grupos ativos e não deletados', async () => {
    const { service, prisma } = await build();
    await service.getPermissionKeys(USER_ID);

    const [args] = prisma.permissions.findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(JSON.stringify(args.where)).toContain('"is_active":true');
    expect(JSON.stringify(args.where)).toContain('"is_deleted":false');
  });
});
