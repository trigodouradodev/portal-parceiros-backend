import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ZeroBounceStatus } from '../enums/zero-bounce-status.enum';

export class EmailValidationResult {
  @ApiProperty({ example: 'maria@email.com' })
  email: string;

  @ApiProperty({
    enum: ZeroBounceStatus,
    description:
      'Vale "unknown" tanto para o status real da ZeroBounce quanto para o ' +
      'fallback fail-open (nesse caso, ver `checked`).',
  })
  status: ZeroBounceStatus;

  @ApiProperty({ example: 'mailbox_not_found' })
  subStatus: string;

  @ApiProperty({
    description:
      'False só quando a ZeroBounce reprova o e-mail de forma inequívoca ' +
      '(ver BLOCKED_ZERO_BOUNCE_STATUSES). Sempre true quando `checked` é ' +
      'false — falha na integração nunca bloqueia o fluxo.',
  })
  isAcceptable: boolean;

  @ApiProperty({
    description:
      'False quando a checagem não pôde ser concluída (ZeroBounce ' +
      'indisponível, sem credencial configurada, timeout etc.) — nesse ' +
      'caso `isAcceptable` é sempre true (fail-open).',
  })
  checked: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: 'maria@gmail.com',
    description: 'Sugestão de correção da ZeroBounce (typo comum de domínio).',
  })
  didYouMean: string | null;
}
