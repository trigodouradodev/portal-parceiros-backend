import { Module } from '@nestjs/common';
import { GeocodingModule } from '../locations/geocoding.module';
import { LocationCheckController } from './location-check.controller';
import { LocationCheckService } from './location-check.service';

@Module({
  imports: [GeocodingModule],
  controllers: [LocationCheckController],
  providers: [LocationCheckService],
})
export class LocationCheckModule {}
