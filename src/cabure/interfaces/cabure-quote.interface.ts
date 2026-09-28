/**
 * Resposta de `POST /v2/quotes` da Caburé (seguro prestamista), com o
 * `productCode` que foi de fato usado na cotação anexado por
 * `CabureService.quote` (não vem no corpo da resposta da Caburé) — quem
 * persistir isso deve gravar `productCode` junto com `id`/`premium`, nunca
 * resolver o produto de novo a partir da própria config local.
 */
export interface CabureQuote {
  id: string;
  premium: number;
  productCode: string;
}
