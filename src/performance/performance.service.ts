import { PeopleScopeService } from '../scope/people-scope.service';
import { ScopeService, ScopeViewer } from '../scope/scope.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  mapPerformance,
  mapPerformanceMonths,
  mapIndividualPerformance,
} from './performance.mapper';
import { PerformanceRepository } from './performance.repository';
import {
  PerformanceMonthsResponseDto,
  PerformanceResponseDto,
  PerformancePersonDto,
  PerformanceAvailability,
} from './dto/performance-response.dto';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly repository: PerformanceRepository,
    private readonly people: PeopleScopeService,
    private readonly scope: ScopeService,
  ) {}

  async getMonths(
    viewer: ScopeViewer,
    partnerId?: string,
  ): Promise<PerformanceMonthsResponseDto> {
    try {
      const ids = partnerId
        ? await this.resolvePartner(viewer, partnerId)
        : await this.allowedPartners(viewer);
      return mapPerformanceMonths(await this.repository.findMonths(ids));
    } catch (cause) {
      if (cause instanceof ForbiddenException) throw cause;
      throw new ServiceUnavailableException('performance_data_unavailable', {
        cause,
      });
    }
  }

  async getPerformance(
    viewer: ScopeViewer,
    month?: string,
    partnerId?: string,
    memberId?: string,
  ): Promise<PerformanceResponseDto> {
    try {
      const userId = await this.resolvePartner(viewer, partnerId);
      const row = await this.repository.findPerformance(userId, month);
      if (!row) throw new Error('missing_performance_reference_month');
      if (memberId) {
        const members = await this.getTeam(viewer, userId, row.requested_month);
        if (!members.some((member) => member.id === memberId)) {
          throw new ForbiddenException('member_outside_partner_team');
        }
        if (!row.id_consultor) return mapPerformance(row);
        return mapIndividualPerformance(
          row.requested_month,
          await this.repository.findIndividual(
            userId,
            memberId,
            row.requested_month,
          ),
        );
      }
      const response = mapPerformance(row);
      if (response.availability === PerformanceAvailability.NO_DATA)
        return response;
      return {
        ...response,
        view: {
          mode: 'CONSOLIDATED',
          portfolioReference: row.data_snapshot_parcelas ?? null,
          missingDetails: false,
        },
      };
    } catch (cause) {
      if (cause instanceof ForbiddenException) throw cause;
      throw new ServiceUnavailableException('performance_data_unavailable', {
        cause,
      });
    }
  }

  async getPartners(
    viewer: ScopeViewer,
    month?: string,
  ): Promise<PerformancePersonDto[]> {
    try {
      return await this.repository.findPartners(
        await this.allowedPartners(viewer),
        month,
      );
    } catch (cause) {
      if (cause instanceof ForbiddenException) throw cause;
      throw new ServiceUnavailableException('performance_data_unavailable', {
        cause,
      });
    }
  }

  async getTeam(
    viewer: ScopeViewer,
    partnerId?: string,
    month?: string,
  ): Promise<PerformancePersonDto[]> {
    try {
      const ownerId = await this.resolvePartner(viewer, partnerId);
      const hierarchy = await this.scope.getViewerScopeIds(ownerId);
      return await this.repository.findTeam(ownerId, hierarchy.userIds, month);
    } catch (cause) {
      if (cause instanceof ForbiddenException) throw cause;
      throw new ServiceUnavailableException('performance_data_unavailable', {
        cause,
      });
    }
  }

  private canSelectPartners(viewer: ScopeViewer): boolean {
    return [
      PermissionKey.INSTALLMENT_VIEW,
      PermissionKey.INSTALLMENT_VIEW_ALL,
      PermissionKey.ROLE_ADMIN,
      PermissionKey.ROLE_SUPPORT,
    ].some((permission) => viewer.permissions.includes(permission));
  }

  private async allowedPartners(viewer: ScopeViewer): Promise<string[]> {
    const people = this.canSelectPartners(viewer)
      ? await this.people.getOptions(viewer)
      : [];
    return [...new Set([viewer.userId, ...people.map((person) => person.id)])];
  }

  private async resolvePartner(
    viewer: ScopeViewer,
    partnerId?: string,
  ): Promise<string> {
    if (!partnerId || partnerId === viewer.userId) return viewer.userId;
    // Mesmas permissões da rota de pessoas da Home, sem ampliar o escopo por VIEW_ALL.
    if (!this.canSelectPartners(viewer)) {
      throw new ForbiddenException('assignee_outside_viewer_scope');
    }
    await this.people.assertCanSelect(viewer, partnerId);
    return partnerId;
  }
}
