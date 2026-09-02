import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { QuoteEventsModule } from '../quote-events/quote-events.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuoteDraftAddressService } from './services/quote-draft-address.service';
import { QuoteDraftIncomeService } from './services/quote-draft-income.service';
import { QuoteDraftPartnerOpinionService } from './services/quote-draft-partner-opinion.service';
import { QuoteDraftRegistrationService } from './services/quote-draft-registration.service';
import { QuoteDraftStepsService } from './services/quote-draft-steps.service';

@Module({
  imports: [ActivitiesModule, QuoteEventsModule],
  controllers: [QuotesController],
  providers: [
    QuoteDraftAddressService,
    QuoteDraftIncomeService,
    QuoteDraftPartnerOpinionService,
    QuoteDraftRegistrationService,
    QuoteDraftStepsService,
    QuotesService,
  ],
  exports: [QuotesService],
})
export class QuotesModule {}
