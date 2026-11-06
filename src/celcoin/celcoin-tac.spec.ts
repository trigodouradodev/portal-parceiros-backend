import { resolveCelcoinTac } from './celcoin-tac';

describe('resolveCelcoinTac', () => {
  it('manda a taxa quando ela rende ao menos o piso', () => {
    expect(resolveCelcoinTac(0.065, 5000, 100)).toEqual({ tac_rate: 0.065 });
  });

  it('manda o piso em valor quando a taxa rende menos que ele', () => {
    expect(resolveCelcoinTac(0.065, 1000, 100)).toEqual({ tac_amount: 100 });
    expect(resolveCelcoinTac(0.065, 1500, 100)).toEqual({ tac_amount: 100 });
  });

  it('no limite em que a taxa rende exatamente o piso, mantém a taxa', () => {
    expect(resolveCelcoinTac(0.05, 2000, 100)).toEqual({ tac_rate: 0.05 });
    expect(resolveCelcoinTac(0.065, 1538.46, 100)).toEqual({
      tac_rate: 0.065,
    });
  });

  it('sem piso (propostas antigas), nunca troca a taxa por valor', () => {
    expect(resolveCelcoinTac(0.05, 1000)).toEqual({ tac_rate: 0.05 });
    expect(resolveCelcoinTac(0.03, 500, 0)).toEqual({ tac_rate: 0.03 });
  });

  it('sem TAC manda tac_amount 0 (isenção) e o piso não se aplica', () => {
    expect(resolveCelcoinTac(0, 1000, 100)).toEqual({ tac_amount: 0 });
    expect(resolveCelcoinTac(0, 1000)).toEqual({ tac_amount: 0 });
  });
});
