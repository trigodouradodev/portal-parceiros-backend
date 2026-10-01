import { HttpException, HttpStatus } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { EmailValidationController } from './email-validation.controller';
import { EmailValidationRateLimiterService } from './email-validation-rate-limiter.service';
import { EmailValidationService } from './email-validation.service';
import { ZeroBounceStatus } from './enums/zero-bounce-status.enum';

function user(sub = 'user-1'): JwtPayload {
  return {
    sub,
    email: 'parceiro@trigo.test',
    role: 'consultant',
    permissions: [],
  };
}

describe('EmailValidationController', () => {
  let controller: EmailValidationController;
  let emailValidation: { validate: jest.Mock };
  let rateLimiter: { consume: jest.Mock };

  beforeEach(() => {
    emailValidation = { validate: jest.fn() };
    rateLimiter = { consume: jest.fn() };
    controller = new EmailValidationController(
      emailValidation as unknown as EmailValidationService,
      rateLimiter as unknown as EmailValidationRateLimiterService,
    );
  });

  it('chama o serviço de validação quando o usuário ainda tem cota', async () => {
    rateLimiter.consume.mockReturnValue(true);
    emailValidation.validate.mockResolvedValue({
      email: 'maria@email.com',
      status: ZeroBounceStatus.VALID,
      subStatus: '',
      isAcceptable: true,
      checked: true,
      didYouMean: null,
    });

    const result = await controller.validate(
      { email: 'maria@email.com' },
      user(),
    );

    expect(rateLimiter.consume).toHaveBeenCalledWith('user-1');
    expect(emailValidation.validate).toHaveBeenCalledWith('maria@email.com');
    expect(result.isAcceptable).toBe(true);
  });

  it('recusa com 429 sem chamar o serviço quando a cota do usuário esgotou', async () => {
    rateLimiter.consume.mockReturnValue(false);

    await expect(
      controller.validate({ email: 'maria@email.com' }, user()),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    } as Partial<HttpException>);
    expect(emailValidation.validate).not.toHaveBeenCalled();
  });

  it('aplica o limite por usuário — o sub do JWT identifica a cota', async () => {
    rateLimiter.consume.mockReturnValue(true);
    emailValidation.validate.mockResolvedValue({
      email: 'maria@email.com',
      status: ZeroBounceStatus.VALID,
      subStatus: '',
      isAcceptable: true,
      checked: true,
      didYouMean: null,
    });

    await controller.validate({ email: 'maria@email.com' }, user('user-2'));

    expect(rateLimiter.consume).toHaveBeenCalledWith('user-2');
  });
});
