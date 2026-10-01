import { PrismaService } from '../prisma/prisma.service';
import { MissingSystemConfigError } from './errors/missing-system-config.error';
import { SystemConfigsService } from './system-configs.service';

const rows = [
  { key: 'CONFIG_A', value: 'value-a' },
  { key: 'CONFIG_B', value: ' value-b ' },
];

function build(configRows = rows) {
  const findMany = jest.fn().mockResolvedValue(configRows);
  const prisma = {
    system_configs: { findMany },
  } as unknown as PrismaService;
  return { service: new SystemConfigsService(prisma), findMany };
}

describe('SystemConfigsService', () => {
  it('busca várias chaves em uma consulta e preserva seus valores', async () => {
    const { service, findMany } = build();

    await expect(service.getValues(['CONFIG_A', 'CONFIG_B'])).resolves.toEqual({
      CONFIG_A: 'value-a',
      CONFIG_B: ' value-b ',
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { key: { in: ['CONFIG_A', 'CONFIG_B'] } },
      select: { key: true, value: true },
    });
  });

  it('devolve null para chave ausente', async () => {
    const { service } = build([]);

    await expect(service.getValue('MISSING')).resolves.toBeNull();
  });

  it('reutiliza inclusive resultados ausentes durante o TTL', async () => {
    const { service, findMany } = build([]);

    await service.getValue('MISSING');
    await service.getValue('MISSING');

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('consulta apenas as chaves que ainda não estão no cache', async () => {
    const { service, findMany } = build();

    await service.getValue('CONFIG_A');
    findMany.mockResolvedValueOnce([{ key: 'CONFIG_C', value: 'value-c' }]);
    await service.getValues(['CONFIG_A', 'CONFIG_C']);

    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { key: { in: ['CONFIG_C'] } },
      select: { key: true, value: true },
    });
  });

  it('falha com erro próprio quando uma config obrigatória não existe', async () => {
    const { service } = build([{ key: 'CONFIG_A', value: 'value-a' }]);

    await expect(
      service.getRequiredValues(['CONFIG_A', 'CONFIG_B']),
    ).rejects.toEqual(new MissingSystemConfigError(['CONFIG_B']));
  });
});
