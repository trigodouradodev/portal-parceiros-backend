import { Module } from '@nestjs/common';
import { QuoteEventsModule } from '../quote-events/quote-events.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [QuoteEventsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
