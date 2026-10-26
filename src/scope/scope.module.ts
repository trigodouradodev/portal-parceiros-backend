import { Module } from '@nestjs/common';
import { PeopleScopeService } from './people-scope.service';
import { ScopeService } from './scope.service';

@Module({
  providers: [ScopeService, PeopleScopeService],
  exports: [ScopeService, PeopleScopeService],
})
export class ScopeModule {}
