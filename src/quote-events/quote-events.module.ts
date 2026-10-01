import { Module } from '@nestjs/common';
import { QuoteEventsService } from './quote-events.service';

@Module({
  providers: [QuoteEventsService],
  exports: [QuoteEventsService],
})
export class QuoteEventsModule {}
