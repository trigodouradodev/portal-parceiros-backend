import { Module } from '@nestjs/common';
import { BrazilLocationsService } from './brazil-locations.service';
import { GeocodingModule } from './geocoding.module';
import { LocationsController } from './locations.controller';
import { PostalCodeService } from './postal-code.service';

@Module({
  imports: [GeocodingModule],
  controllers: [LocationsController],
  providers: [BrazilLocationsService, PostalCodeService],
})
export class LocationsModule {}
