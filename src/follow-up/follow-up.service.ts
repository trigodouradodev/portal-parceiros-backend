import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';

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

    const hasGeolocation =
      dto.latitude !== undefined && dto.longitude !== undefined;

    return this.prisma.$transaction(async (tx) => {
      const followup = await tx.installment_followups.create({
        data: {
          contract_id: dto.contractId,
          installment_number: dto.installmentNumber ?? null,
          status: dto.status,
          note: dto.note ?? null,
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
    });
  }
}
