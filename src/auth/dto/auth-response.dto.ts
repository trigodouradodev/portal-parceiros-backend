import { ApiProperty } from '@nestjs/swagger';
import { ProfileResponseDto } from './profile-response.dto';

/** Par de tokens JWT retornado por login/refresh. */
export class TokensDto {
  @ApiProperty({ description: 'Access token JWT (Bearer).' })
  accessToken: string;

  @ApiProperty({ description: 'Refresh token JWT.' })
  refreshToken: string;
}

/** Resposta de POST /auth/login: usuário + tokens. */
export class LoginResponseDto extends TokensDto {
  @ApiProperty({ type: ProfileResponseDto })
  user: ProfileResponseDto;
}
