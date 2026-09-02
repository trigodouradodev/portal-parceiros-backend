import { Module } from '@nestjs/common';
import { BrazilLocationsService } from './brazil-locations.service';
import { LocationsController } from './locations.controller';
import { PostalCodeService } from './postal-code.service';

@Module({
  controllers: [LocationsController],
  providers: [BrazilLocationsService, PostalCodeService],
})
export class LocationsModule {}
