import { Module } from '@nestjs/common';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { EmailValidationController } from './email-validation.controller';
import { EmailValidationService } from './email-validation.service';

@Module({
  imports: [SystemConfigsModule],
  controllers: [EmailValidationController],
  providers: [EmailValidationService],
})
export class EmailValidationModule {}
