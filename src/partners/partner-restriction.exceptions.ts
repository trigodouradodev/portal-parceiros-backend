import { ForbiddenException } from '@nestjs/common';
import { PartnerRestrictionCode } from './enums/partner-restriction-code.enum';

export const PARTNER_ACCESS_RESTRICTED_MESSAGE =
  'Acesso bloqueado. Fale com seu gerente.';
export const PARTNER_ORIGINATION_RESTRICTED_MESSAGE =
  'Você está com a originação restrita. Fale com seu gerente.';

/** Parceiro suspenso, desligado ou com restrição de acesso ativa. */
export class PartnerAccessRestrictedException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: PartnerRestrictionCode.ACCESS_RESTRICTED,
      message: PARTNER_ACCESS_RESTRICTED_MESSAGE,
    });
  }
}

/** Parceiro com restrição de originação ativa (iniciar ou enviar proposta). */
export class PartnerOriginationRestrictedException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: PartnerRestrictionCode.ORIGINATION_RESTRICTED,
      message: PARTNER_ORIGINATION_RESTRICTED_MESSAGE,
    });
  }
}
