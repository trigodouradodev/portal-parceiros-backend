import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PerformanceModule } from './performance/performance.module';
import { CollectionsModule } from './collections/collections.module';
import { ActivitiesModule } from './activities/activities.module';
import { FollowUpModule } from './follow-up/follow-up.module';
import { LocationCheckModule } from './location-check/location-check.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { ContractsModule } from './contracts/contracts.module';
import { ProductsModule } from './products/products.module';
import { QuotesModule } from './quotes/quotes.module';
import { SimulationsModule } from './simulations/simulations.module';
import { EligibilityModule } from './eligibility/eligibility.module';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    DashboardModule,
    PerformanceModule,
    CollectionsModule,
    ActivitiesModule,
    FollowUpModule,
    LocationCheckModule,
    PortfolioModule,
    ContractsModule,
    ProductsModule,
    QuotesModule,
    SimulationsModule,
    EligibilityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
