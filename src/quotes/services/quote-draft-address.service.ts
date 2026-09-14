import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { SaveQuoteAddressDto } from '../dto/save-quote-address.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteAddressSnapshot } from '../interfaces/quote-address-snapshot.interface';
import { QuoteDraftStepsService } from './quote-draft-steps.service';

@Injectable()
export class QuoteDraftAddressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteDraftSteps: QuoteDraftStepsService,
  ) {}

  async save(
    quoteId: string,
    dto: SaveQuoteAddressDto,
    actor: JwtPayload,
  ): Promise<QuoteAddressSnapshot> {
    const address = normalizeAddress(dto);

    return this.prisma.$transaction(async (tx) => {
      const updatedAt = new Date();
      const isAdmin = actor.permissions.includes(PermissionKey.ROLE_ADMIN);
      const result = await tx.quotes.updateMany({
        where: {
          id: quoteId,
          quote_status: QuoteStatus.DRAFT,
          ...(isAdmin ? {} : { current_sales_agent_id: actor.sub }),
        },
        data: {
          client_address: address.clientAddress,
          geolocation: address.geolocation ?? Prisma.DbNull,
          updated_at: updatedAt,
        },
      });

      if (result.count === 0) {
        await this.quoteDraftSteps.throwSaveError(
          tx,
          quoteId,
          actor,
          isAdmin,
          'O endereço',
        );
      }

      const progress = await this.quoteDraftSteps.completeWithinTransaction(
        tx,
        quoteId,
        QuoteDraftStep.ADDRESS,
        updatedAt,
      );

      return {
        id: quoteId,
        status: QuoteStatus.DRAFT,
        step: QuoteDraftStep.ADDRESS,
        completedAt: progress.completed_at,
        updatedAt: progress.updated_at,
        ...address.clientAddress,
        ...(address.geolocation ? { geolocation: address.geolocation } : {}),
      };
    });
  }
}

function normalizeAddress(dto: SaveQuoteAddressDto) {
  return {
    clientAddress: {
      zipCode: dto.zipCode.replace(/\D/g, ''),
      streetName: dto.streetName.trim(),
      streetNumber: dto.streetNumber.trim(),
      streetComplement: dto.streetComplement?.trim() ?? '',
      streetDistrict: dto.streetDistrict.trim(),
      city: dto.city.trim(),
      state: dto.state,
      referencePoint: dto.referencePoint.trim(),
    },
    geolocation: dto.geolocation
      ? {
          latitude: dto.geolocation.latitude,
          longitude: dto.geolocation.longitude,
          precision: dto.geolocation.precision.trim(),
        }
      : null,
  };
}
