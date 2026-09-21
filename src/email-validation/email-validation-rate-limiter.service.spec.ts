import { EmailValidationRateLimiterService } from './email-validation-rate-limiter.service';

describe('EmailValidationRateLimiterService', () => {
  let service: EmailValidationRateLimiterService;
  let nowMs: number;

  beforeEach(() => {
    service = new EmailValidationRateLimiterService();
    nowMs = Date.parse('2026-09-21T12:00:00.000Z');
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('permite até o limite de requisições na janela', () => {
    for (let i = 0; i < 20; i++) {
      expect(service.consume('user-1')).toBe(true);
    }
  });

  it('bloqueia a 21ª requisição na mesma janela', () => {
    for (let i = 0; i < 20; i++) {
      service.consume('user-1');
    }
    expect(service.consume('user-1')).toBe(false);
  });

  it('não afeta a cota de outro usuário', () => {
    for (let i = 0; i < 20; i++) {
      service.consume('user-1');
    }
    expect(service.consume('user-1')).toBe(false);
    expect(service.consume('user-2')).toBe(true);
  });

  it('libera cota depois que a janela de 10 minutos passa', () => {
    for (let i = 0; i < 20; i++) {
      service.consume('user-1');
    }
    expect(service.consume('user-1')).toBe(false);

    nowMs += 10 * 60 * 1000 + 1;
    expect(service.consume('user-1')).toBe(true);
  });
});
