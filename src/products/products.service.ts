import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductOption } from './interfaces/product-option.interface';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Produtos explicitamente vinculados ao usuário em
   * `consultant_finance_products`. Não depende da existência de contratos.
   */
  async getProducts(userId: string): Promise<ProductOption[]> {
    return this.prisma.$queryRaw<ProductOption[]>`
      SELECT DISTINCT
        fp.id,
        fp.product_name AS description
      FROM public.consultant_finance_products cfp
      JOIN public.finance_products fp ON fp.id = cfp.finance_product_id
      WHERE cfp.consultant_id = ${userId}::uuid
      ORDER BY description ASC, fp.id ASC
    `;
  }
}
