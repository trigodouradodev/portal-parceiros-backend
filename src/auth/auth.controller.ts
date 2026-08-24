import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
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
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
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

  @ApiOperation({
    summary: 'Edita o próprio perfil (nome, telefone).',
    description:
      'E-mail não é editável por aqui — é o login do usuário; alterá-lo é uma operação administrativa.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiBadRequestResponse({
    description:
      'Payload inválido, campo não permitido ou nada para atualizar.',
  })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou inválido.' })
  @ApiBearerAuth('access-token')
  @Patch('me')
  updateMe(@CurrentUser('sub') userId: string, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(userId, dto);
  }

  @ApiOperation({ summary: 'Altera a senha do usuário autenticado.' })
  @ApiOkResponse({ description: 'Senha alterada com sucesso.' })
  @ApiBadRequestResponse({
    description: 'Payload inválido ou nova senha igual à atual.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token inválido ou senha atual incorreta.',
  })
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @Patch('change-password')
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }
}
