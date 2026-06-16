import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto, TokensDto } from './dto/auth-response.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtPayload } from './interfaces/jwt-payload.interface';

interface RefreshRequest {
  user: JwtPayload;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Login por email/senha; retorna access + refresh token.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Payload inválido.' })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas.' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiOperation({
    summary: 'Renova os tokens a partir de um refresh token válido.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  @ApiOkResponse({ type: TokensDto })
  @ApiUnauthorizedResponse({
    description: 'Refresh token ausente ou inválido.',
  })
  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Req() req: RefreshRequest) {
    return this.authService.refreshTokens(req.user.sub);
  }

  @ApiOperation({ summary: 'Perfil do usuário autenticado.' })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
  @ApiBearerAuth('access-token')
  @Get('me')
  me(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }
}
