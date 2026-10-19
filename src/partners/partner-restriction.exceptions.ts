import { ForbiddenException } from '@nestjs/common';

/** Códigos estáveis do erro 403, para o frontend distinguir os casos. */
export const PARTNER_ACCESS_RESTRICTED = 'PARTNER_ACCESS_RESTRICTED';
export const PARTNER_ORIGINATION_RESTRICTED = 'PARTNER_ORIGINATION_RESTRICTED';

export const PARTNER_ACCESS_RESTRICTED_MESSAGE =
  'Acesso bloqueado. Fale com seu gerente.';
export const PARTNER_ORIGINATION_RESTRICTED_MESSAGE =
  'Você está com a originação restrita. Fale com seu gerente.';

/** Parceiro suspenso, desligado ou com restrição de acesso ativa. */
export class PartnerAccessRestrictedException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: PARTNER_ACCESS_RESTRICTED,
      message: PARTNER_ACCESS_RESTRICTED_MESSAGE,
    });
  }
}

/** Parceiro com restrição de originação ativa (iniciar ou enviar proposta). */
export class PartnerOriginationRestrictedException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: PARTNER_ORIGINATION_RESTRICTED,
      message: PARTNER_ORIGINATION_RESTRICTED_MESSAGE,
    });
  }
}
