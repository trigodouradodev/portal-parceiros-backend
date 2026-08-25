import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import {
  AutomaticFollowUpAction,
  FollowUpParty,
  FollowUpStatus,
  FollowUpType,
} from './enums/follow-up.enums';

interface NormalizedFollowUp {
  status: FollowUpStatus;
  followupType: FollowUpType | null;
  party: FollowUpParty | null;
  automaticAction: AutomaticFollowUpAction | null;
}

@Injectable()
export class FollowUpService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra um follow-up de parcela. Quando latitude/longitude são enviadas
   * (visita), grava o ponto em `geolocations` na mesma transação.
   */
  async create(userId: string, dto: CreateFollowUpDto) {
    const contract = await this.prisma.contracts.findUnique({
      where: { id: dto.contractId },
      select: { id: true },
    });
    if (!contract) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    const normalized = this.normalize(dto);
    return this.prisma.$transaction((tx) =>
      this.persistWithinTransaction(tx, userId, dto, normalized),
    );
  }

  /**
   * Persiste um follow-up usando uma transação já aberta pelo chamador.
   * Usado pela execução de atividades para tornar tarefa, interação e
   * follow-up uma única operação atômica.
   */
  async createWithinTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: CreateFollowUpDto,
  ) {
    const normalized = this.normalize(dto);
    return this.persistWithinTransaction(tx, userId, dto, normalized);
  }

  private async persistWithinTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: CreateFollowUpDto,
    normalized: NormalizedFollowUp,
  ) {
    const hasGeolocation =
      dto.latitude !== undefined && dto.longitude !== undefined;
    const followup = await tx.installment_followups.create({
      data: {
        contract_id: dto.contractId,
        installment_number: dto.installmentNumber ?? null,
        status: normalized.status,
        note: dto.note ?? null,
        followup_type: normalized.followupType,
        party: normalized.party,
        automatic_action: normalized.automaticAction,
        expected_result: dto.expectedResult ?? null,
        payment_forecast: dto.paymentForecast
          ? new Date(dto.paymentForecast)
          : null,
        user_id: userId,
      },
    });

    if (hasGeolocation) {
      await tx.geolocations.create({
        data: {
          installment_followup_id: followup.id,
          latitude: new Prisma.Decimal(dto.latitude!),
          longitude: new Prisma.Decimal(dto.longitude!),
        },
      });
    }

    return followup;
  }

  private normalize(dto: CreateFollowUpDto): NormalizedFollowUp {
    const hasStructuredField = dto.party != null || dto.automaticAction != null;

    if (dto.followUpType == null) {
      if (hasStructuredField) {
        throw new BadRequestException(
          'followUpType é obrigatório para o modelo estruturado.',
        );
      }
      if (!dto.status) {
        throw new BadRequestException('Status é obrigatório no modelo legado.');
      }
      return {
        status: dto.status,
        followupType: null,
        party: null,
        automaticAction: null,
      };
    }

    const followUpType = dto.followUpType;

    if (dto.status != null) {
      throw new BadRequestException(
        'Não envie status junto do modelo estruturado.',
      );
    }
    if (!dto.party) {
      throw new BadRequestException(
        'Parte é obrigatória no modelo estruturado.',
      );
    }

    if (followUpType === FollowUpType.AUTOMATIC) {
      if (!dto.automaticAction) {
        throw new BadRequestException('Ação automática é obrigatória.');
      }
      if (dto.expectedResult != null) {
        throw new BadRequestException(
          'Resultado esperado não é permitido em follow-up automático.',
        );
      }
      if (
        dto.automaticAction === AutomaticFollowUpAction.RENEGOTIATION &&
        dto.party !== FollowUpParty.CLIENT
      ) {
        throw new BadRequestException(
          'Renegociação é permitida apenas para cliente.',
        );
      }
    } else if (dto.automaticAction != null) {
      throw new BadRequestException(
        'Ação automática só é permitida em follow-up automático.',
      );
    }

    return {
      status: this.deriveLegacyStatus(
        followUpType,
        dto.party,
        dto.automaticAction,
      ),
      followupType: followUpType,
      party: dto.party,
      automaticAction: dto.automaticAction ?? null,
    };
  }

  private deriveLegacyStatus(
    followupType: FollowUpType,
    party: FollowUpParty,
    automaticAction?: AutomaticFollowUpAction,
  ): FollowUpStatus {
    switch (followupType) {
      case FollowUpType.CALL:
        return party === FollowUpParty.CLIENT
          ? FollowUpStatus.CLIENT_CALL
          : FollowUpStatus.GUARANTOR_CALL;
      case FollowUpType.MESSAGE:
        return FollowUpStatus.WHATSAPP_MESSAGE;
      case FollowUpType.VISIT:
        return party === FollowUpParty.CLIENT
          ? FollowUpStatus.CLIENT_VISIT
          : FollowUpStatus.GUARANTOR_VISIT;
      case FollowUpType.AUTOMATIC:
        switch (automaticAction) {
          case AutomaticFollowUpAction.COLLECTION_LETTER:
            return party === FollowUpParty.CLIENT
              ? FollowUpStatus.CLIENT_COLLECTION_LETTER
              : FollowUpStatus.GUARANTOR_COLLECTION_LETTER;
          case AutomaticFollowUpAction.NEGATIVATION:
            return FollowUpStatus.NEGATIVATION;
          case AutomaticFollowUpAction.RENEGOTIATION:
            return FollowUpStatus.RENEGOTIATION;
          default:
            throw new BadRequestException('Ação automática inválida.');
        }
    }
  }
}
