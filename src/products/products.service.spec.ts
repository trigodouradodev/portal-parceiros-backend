import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

const USER_ID = '269b0843-0aa8-40ab-af66-8304909930a6';

const rawProduct = {
  id: 'product-1',
  description: 'CRÉDITO PESSOAL',
  minInterestRate: '0.02',
  maxInterestRate: '0.0339',
  minInstallmentCount: '2',
  maxInstallmentCount: '12',
  enabled: true,
};

async function buildService(products = [rawProduct]) {
  const prisma = { $queryRaw: jest.fn(() => Promise.resolve(products)) };
  const module: TestingModule = await Test.createTestingModule({
    providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get(ProductsService), prisma };
}

describe('ProductsService.getProducts', () => {
  it('devolve id, descrição, taxas e limites de parcela', async () => {
    const { service } = await buildService();

    await expect(service.getProducts(USER_ID)).resolves.toEqual([
      {
        id: 'product-1',
        description: 'CRÉDITO PESSOAL',
        minInterestRate: 0.02,
        maxInterestRate: 0.0339,
        minInstallmentCount: 2,
        maxInstallmentCount: 12,
        enabled: true,
      },
    ]);
  });

  it('restringe as opções ao vínculo explícito de produto do usuário', async () => {
    const { service, prisma } = await buildService();
    await service.getProducts(USER_ID);

    const [strings, userId] = prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    const sql = strings.join(' ');

    expect(sql).toContain('FROM public.consultant_finance_products cfp');
    expect(sql).toContain('cfp.consultant_id =');
    expect(sql).toContain('JOIN public.finance_products fp');
    expect(sql).not.toContain('public.contracts');
    expect(sql).toContain('ORDER BY description ASC');
    expect(sql).toContain('min_interest_rate');
    expect(sql).toContain('max_installment_count');
    expect(userId).toBe(USER_ID);
  });
});
