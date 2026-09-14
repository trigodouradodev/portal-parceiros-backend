import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BrazilState } from '../common/brazil-state.enum';
import { PostalCodeAddress } from './interfaces/postal-code-address.interface';

const VIA_CEP_URL = 'https://viacep.com.br/ws';

interface ViaCepResponse {
  erro?: boolean;
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

@Injectable()
export class PostalCodeService {
  private readonly logger = new Logger(PostalCodeService.name);

  async find(zipCode: string): Promise<PostalCodeAddress> {
    const digits = zipCode.replace(/\D/g, '');
    if (!/^\d{8}$/.test(digits)) {
      throw new BadRequestException('CEP inválido.');
    }

    let payload: ViaCepResponse;
    try {
      const response = await fetch(`${VIA_CEP_URL}/${digits}/json/`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = (await response.json()) as ViaCepResponse;
    } catch (error) {
      this.logger.error(`Falha ao consultar ViaCEP: ${String(error)}`);
      throw new ServiceUnavailableException(
        'Serviço de consulta de CEP indisponível.',
      );
    }

    if (payload.erro) {
      throw new NotFoundException('CEP não encontrado.');
    }

    const state = payload.uf?.toUpperCase();
    if (!state || !isBrazilState(state) || !payload.localidade) {
      this.logger.error('ViaCEP retornou um endereço incompleto.');
      throw new ServiceUnavailableException(
        'Serviço de consulta de CEP retornou dados inválidos.',
      );
    }

    return {
      zipCode: digits,
      streetName: payload.logradouro?.trim() ?? '',
      ...(payload.complemento?.trim()
        ? { streetComplement: payload.complemento.trim() }
        : {}),
      streetDistrict: payload.bairro?.trim() ?? '',
      city: payload.localidade.trim(),
      state,
    };
  }
}

function isBrazilState(value: string): value is BrazilState {
  return Object.values(BrazilState).includes(value as BrazilState);
}
