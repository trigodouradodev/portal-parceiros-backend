import { ApiProperty } from '@nestjs/swagger';

/** Resposta do healthcheck. */
export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ format: 'date-time', example: '2026-06-16T13:00:00.000Z' })
  timestamp: string;
}
