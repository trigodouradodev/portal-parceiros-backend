import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import {
  AutomaticFollowUpAction,
  FollowUpExpectedResult,
  FollowUpParty,
  FollowUpStatus,
  FollowUpType,
} from './enums/follow-up.enums';
import { FollowUpService } from './follow-up.service';

const CONTRACT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

function dto(overrides: Partial<CreateFollowUpDto> = {}): CreateFollowUpDto {
  return Object.assign(new CreateFollowUpDto(), {
    contractId: CONTRACT_ID,
    installmentNumber: 3,
    note: 'Observação do follow-up',
    ...overrides,
  });
}

async function build() {
  const tx = {
    installment_followups: {
      create: jest.fn().mockResolvedValue({ id: 'followup-1' }),
    },
    geolocations: { create: jest.fn().mockResolvedValue({ id: 'geo-1' }) },
  };
  const prisma = {
    contracts: {
      findUnique: jest.fn().mockResolvedValue({ id: CONTRACT_ID }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );

  const module: TestingModule = await Test.createTestingModule({
    providers: [FollowUpService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: module.get(FollowUpService), prisma, tx };
}

describe('FollowUpService.create — modelo estruturado', () => {
  it('grava chamada ao cliente com resultado esperado', async () => {
    const { service, tx } = await build();

    await service.create(
      USER_ID,
      dto({
        followUpType: FollowUpType.CALL,
        party: FollowUpParty.CLIENT,
        expectedResult: FollowUpExpectedResult.WILL_PAY_ON_DATE,
        paymentForecast: '2026-08-25T00:00:00.000Z',
      }),
    );

    expect(tx.installment_followups.create).toHaveBeenCalledWith({
      data: {
        contract_id: CONTRACT_ID,
        installment_number: 3,
        status: FollowUpStatus.CLIENT_CALL,
        note: 'Observação do follow-up',
        followup_type: FollowUpType.CALL,
        party: FollowUpParty.CLIENT,
        automatic_action: null,
        expected_result: FollowUpExpectedResult.WILL_PAY_ON_DATE,
        payment_forecast: new Date('2026-08-25T00:00:00.000Z'),
        user_id: USER_ID,
      },
    });
  });

  it('mantém geolocalização em visitas estruturadas', async () => {
    const { service, tx } = await build();

    await service.create(
      USER_ID,
      dto({
        followUpType: FollowUpType.VISIT,
        party: FollowUpParty.GUARANTOR,
        latitude: -23.55052,
        longitude: -46.633308,
      }),
    );

    expect(tx.installment_followups.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: FollowUpStatus.GUARANTOR_VISIT,
          followup_type: FollowUpType.VISIT,
          party: FollowUpParty.GUARANTOR,
        }) as unknown,
      }),
    );
    expect(tx.geolocations.create).toHaveBeenCalledWith({
      data: {
        installment_followup_id: 'followup-1',
        latitude: expect.any(Prisma.Decimal) as unknown,
        longitude: expect.any(Prisma.Decimal) as unknown,
      },
    });
  });

  it('grava negativação do avalista como automático', async () => {
    const { service, tx } = await build();

    await service.create(
      USER_ID,
      dto({
        followUpType: FollowUpType.AUTOMATIC,
        party: FollowUpParty.GUARANTOR,
        automaticAction: AutomaticFollowUpAction.NEGATIVATION,
      }),
    );

    expect(tx.installment_followups.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: FollowUpStatus.NEGATIVATION,
          followup_type: FollowUpType.AUTOMATIC,
          party: FollowUpParty.GUARANTOR,
          automatic_action: AutomaticFollowUpAction.NEGATIVATION,
        }) as unknown,
      }),
    );
  });

  it('rejeita resultado esperado em follow-up automático', async () => {
    const { service, prisma } = await build();

    await expect(
      service.create(
        USER_ID,
        dto({
          followUpType: FollowUpType.AUTOMATIC,
          party: FollowUpParty.CLIENT,
          automaticAction: AutomaticFollowUpAction.COLLECTION_LETTER,
          expectedResult: FollowUpExpectedResult.NO_RETURN,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejeita renegociação para avalista', async () => {
    const { service } = await build();

    await expect(
      service.create(
        USER_ID,
        dto({
          followUpType: FollowUpType.AUTOMATIC,
          party: FollowUpParty.GUARANTOR,
          automaticAction: AutomaticFollowUpAction.RENEGOTIATION,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('preserva o payload legado durante a transição', async () => {
    const { service, tx } = await build();

    await service.create(
      USER_ID,
      dto({ status: FollowUpStatus.PROMISE_TO_PAY }),
    );

    expect(tx.installment_followups.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: FollowUpStatus.PROMISE_TO_PAY,
          followup_type: null,
          party: null,
          automatic_action: null,
        }) as unknown,
      }),
    );
  });
});
