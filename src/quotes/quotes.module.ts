import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { QuoteEventsModule } from '../quote-events/quote-events.module';
import { ScopeModule } from '../scope/scope.module';
import { StorageModule } from '../storage/storage.module';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { QuoteDraftDocumentationController } from './quote-draft-documentation.controller';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuoteDraftAddressService } from './services/quote-draft-address.service';
import { QuoteDraftDocumentationService } from './services/quote-draft-documentation.service';
import { QuoteDraftFinancialService } from './services/quote-draft-financial.service';
import { QuoteDraftGuarantorService } from './services/quote-draft-guarantor.service';
import { QuoteDraftIncomeService } from './services/quote-draft-income.service';
import { QuoteDraftPartnerOpinionService } from './services/quote-draft-partner-opinion.service';
import { QuoteDraftRegistrationService } from './services/quote-draft-registration.service';
import { QuoteDraftStepsService } from './services/quote-draft-steps.service';
import { QuoteReadService } from './services/quote-read.service';

@Module({
  imports: [
    ActivitiesModule,
    QuoteEventsModule,
    ScopeModule,
    StorageModule,
    SystemConfigsModule,
  ],
  controllers: [QuotesController, QuoteDraftDocumentationController],
  providers: [
    QuoteDraftAddressService,
    QuoteDraftDocumentationService,
    QuoteDraftFinancialService,
    QuoteDraftGuarantorService,
    QuoteDraftIncomeService,
    QuoteDraftPartnerOpinionService,
    QuoteDraftRegistrationService,
    QuoteDraftStepsService,
    QuoteReadService,
    QuotesService,
  ],
  exports: [QuotesService],
})
export class QuotesModule {}
