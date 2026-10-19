import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GetPerformanceQueryDto } from './get-performance-query.dto';

describe('GetPerformanceQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });
  const metadata = { type: 'query' as const, metatype: GetPerformanceQueryDto };

  it.each(['2026-01', '2026-09', '2026-12', '2000-02', '0001-01'])(
    'aceita competência %s',
    async (month) => {
      await expect(pipe.transform({ month }, metadata)).resolves.toMatchObject({
        month,
      });
    },
  );

  it('aceita mês omitido para usar o mês do banco', async () => {
    await expect(pipe.transform({}, metadata)).resolves.toBeInstanceOf(
      GetPerformanceQueryDto,
    );
  });

  it.each([
    '2026-00',
    '2026-13',
    '2026-9',
    '2026-09-01',
    '0000-01',
    '',
    ' ',
    '2026-09\n',
    "2026-09'; SELECT 1",
    ['2026-09', '2026-10'],
    null,
  ])('recusa mês inválido %p', async (month) => {
    await expect(pipe.transform({ month }, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('recusa tentativa de consultar outro parceiro por query string', async () => {
    await expect(
      pipe.transform({ month: '2026-09', userId: 'outro-parceiro' }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
