import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductOption } from './interfaces/product-option.interface';

interface ProductRow {
  id: string;
  description: string;
  minInterestRate: number | string;
  maxInterestRate: number | string;
  minInstallmentCount: number | string;
  maxInstallmentCount: number | string;
  enabled: boolean;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Produtos explicitamente vinculados ao usuário em
   * `consultant_finance_products`. Não depende da existência de contratos.
   */
  async getProducts(userId: string): Promise<ProductOption[]> {
    const rows = await this.prisma.$queryRaw<ProductRow[]>`
      SELECT DISTINCT
        fp.id,
        fp.product_name AS description,
        fp.min_interest_rate AS "minInterestRate",
        fp.max_interest_rate AS "maxInterestRate",
        fp.min_installment_count AS "minInstallmentCount",
        fp.max_installment_count AS "maxInstallmentCount",
        fp.enabled
      FROM public.consultant_finance_products cfp
      JOIN public.finance_products fp ON fp.id = cfp.finance_product_id
      WHERE cfp.consultant_id = ${userId}::uuid
      ORDER BY description ASC, fp.id ASC
    `;

    return rows.map((row) => ({
      id: row.id,
      description: row.description,
      minInterestRate: Number(row.minInterestRate),
      maxInterestRate: Number(row.maxInterestRate),
      minInstallmentCount: Number(row.minInstallmentCount),
      maxInstallmentCount: Number(row.maxInstallmentCount),
      enabled: Boolean(row.enabled),
    }));
  }
}
