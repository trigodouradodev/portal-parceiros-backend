import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { HealthResponseDto } from './health-response.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @ApiOperation({ summary: 'Healthcheck (público).' })
  @ApiOkResponse({ type: HealthResponseDto })
  @Public()
  @Get()
  check(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
