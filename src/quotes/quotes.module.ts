import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { QuoteEventsModule } from '../quote-events/quote-events.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [ActivitiesModule, QuoteEventsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
