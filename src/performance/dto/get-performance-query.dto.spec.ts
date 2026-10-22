import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  GetPerformanceQueryDto,
  GetPerformanceMonthsQueryDto,
} from './get-performance-query.dto';

describe('GetPerformanceQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });
  const metadata = {
    type: 'query' as const,
    metatype: GetPerformanceQueryDto,
  };

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

  describe.each([GetPerformanceQueryDto, GetPerformanceMonthsQueryDto])(
    '%s partnerId',
    (metatype) => {
      const metadata = { type: 'query' as const, metatype };
      it('aceita UUID de pessoa selecionada', async () => {
        const partnerId = '2410a057-4613-4596-a164-e07c694b7eff';
        await expect(
          pipe.transform({ partnerId }, metadata),
        ).resolves.toMatchObject({ partnerId });
      });
      it.each([null, '', 'invalid', ['2410a057-4613-4596-a164-e07c694b7eff']])(
        'recusa parâmetro inválido %p',
        async (partnerId) => {
          await expect(
            pipe.transform({ partnerId }, metadata),
          ).rejects.toBeInstanceOf(BadRequestException);
        },
      );
    },
  );
  it.each([null, '', 'not-a-uuid', ['adb77ae3-7fda-4b87-856e-9583f4d90d0c']])(
    'recusa integrante inválido %p',
    async (memberId) => {
      await expect(
        pipe.transform({ memberId }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('aceita o integrante separado do titular e da competência', async () => {
    const memberId = 'adb77ae3-7fda-4b87-856e-9583f4d90d0c';
    await expect(
      pipe.transform(
        {
          month: '2026-10',
          partnerId: 'f630bd84-1425-423a-a533-5e5139abb9d5',
          memberId,
        },
        metadata,
      ),
    ).resolves.toMatchObject({ memberId });
  });
});
