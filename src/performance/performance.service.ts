import { PeopleScopeService } from '../scope/people-scope.service';
import { ScopeViewer } from '../scope/scope.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mapPerformance, mapPerformanceMonths } from './performance.mapper';
import { PerformanceRepository } from './performance.repository';
import {
  PerformanceMonthsResponseDto,
  PerformanceResponseDto,
} from './dto/performance-response.dto';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly repository: PerformanceRepository,
    private readonly people: PeopleScopeService,
  ) {}

  async getMonths(
    viewer: ScopeViewer,
    partnerId?: string,
  ): Promise<PerformanceMonthsResponseDto> {
    try {
      const userId = await this.resolvePartner(viewer, partnerId);
      return mapPerformanceMonths(await this.repository.findMonths(userId));
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
  ): Promise<PerformanceResponseDto> {
    try {
      const userId = await this.resolvePartner(viewer, partnerId);
      const row = await this.repository.findPerformance(userId, month);
      if (!row) throw new Error('missing_performance_reference_month');
      return mapPerformance(row);
    } catch (cause) {
      if (cause instanceof ForbiddenException) throw cause;
      throw new ServiceUnavailableException('performance_data_unavailable', {
        cause,
      });
    }
  }

  private async resolvePartner(
    viewer: ScopeViewer,
    partnerId?: string,
  ): Promise<string> {
    if (!partnerId || partnerId === viewer.userId) return viewer.userId;
    // Mesmas permissões da rota de pessoas da Home, sem ampliar o escopo por VIEW_ALL.
    if (
      ![
        PermissionKey.INSTALLMENT_VIEW,
        PermissionKey.INSTALLMENT_VIEW_ALL,
        PermissionKey.ROLE_ADMIN,
        PermissionKey.ROLE_SUPPORT,
      ].some((permission) => viewer.permissions.includes(permission))
    ) {
      throw new ForbiddenException('assignee_outside_viewer_scope');
    }
    await this.people.assertCanSelect(viewer, partnerId);
    return partnerId;
  }
}
