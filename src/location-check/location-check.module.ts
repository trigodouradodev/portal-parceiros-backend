import { Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { LocationCheckController } from './location-check.controller';
import { LocationCheckService } from './location-check.service';

@Module({
  controllers: [LocationCheckController],
  providers: [LocationCheckService, GeocodingService],
})
export class LocationCheckModule {}
