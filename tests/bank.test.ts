/**
 * Reading bank alerts (src/lib/bank.ts). The alerts here are made up in the shape banks
 * send them; none is a real message.
 */
import { describe, expect, it } from 'vitest';
import { clean, guessCategory, isNotice, mask, plain, placeKey, readAlert, tidyPlace } from '../src/lib/bank';

describe('readAlert', () => {
  it('reads a card payment: amount, currency, place, day', () => {
    const r = readAlert('Odenis: 12.50 AZN\nMerchant: BRAVO SUPERMARKET 6077\nBalans: 250.00 AZN\n14.11.2026 18:22');
    expect(r).toMatchObject({ direction: 'out', declined: false, amount: 12.5, currency: 'AZN', place: 'Bravo Supermarket', day: '2026-11-14' });
  });

  it('takes the payment, not the balance or the fee', () => {
    expect(readAlert('Balans: 900.00 AZN. Purchase 7.20 AZN WOLT')?.amount).toBe(7.2);
    expect(readAlert('Komissiya: 0.50 AZN Mebleg: 40 AZN odenis')?.amount).toBe(40);
  });

  it('reads the sign and the currency sign', () => {
    expect(readAlert('Köçürmə: -1.00₼')).toMatchObject({ direction: 'out', amount: 1, currency: 'AZN' });
    expect(readAlert('+250.00 USD credited')).toMatchObject({ direction: 'in', amount: 250, currency: 'USD' });
  });

  it('reads thousands written with a space and a decimal comma', () => {
    expect(readAlert('Purchase 2 802,65 AZN IKEA')?.amount).toBe(2802.65);
  });

  it('marks a declined payment and a transfer', () => {
    expect(readAlert('Imtina: 30 AZN odenis, balans catismazligi')?.declined).toBe(true);
    expect(readAlert('Card to card transfer 100 AZN')?.transfer).toBe(true);
  });

  it('is unsure when the alert does not say which way the money went', () => {
    expect(readAlert('15 AZN Azercell')?.direction).toBe('unsure');
  });

  it('gives nothing when there is no amount', () => {
    expect(readAlert('Hörmətli müştəri, kartınız hazırdır.')).toBeNull();
  });

  it('never keeps a full card number', () => {
    const r = readAlert('Purchase 5 AZN CARD 4111111111111111 KFC');
    expect(JSON.stringify(r)).not.toContain('4111111111111111');
  });
});

describe('cleaning text', () => {
  it('masks card and account numbers down to the last four', () => {
    expect(mask('CARD 4111111111111111')).toBe('CARD •••• 1111');
    expect(mask('4111 1111 1111 1111')).toBe('•••• 1111');
    expect(mask('12.50 AZN at 18:22')).toBe('12.50 AZN at 18:22');
  });

  it('drops the invisible direction marks around amounts', () => {
    expect(clean('-‎1.00‎₼')).toBe('-1.00₼');
  });

  it('reads Azerbaijani letters and their Latin spellings alike', () => {
    expect(plain('Ödəniş')).toBe(plain('odenis'));
    expect(plain('odenish')).toBe('odenis');
  });
});

describe('places', () => {
  it('tidies a shouted name and drops terminal numbers', () => {
    expect(tidyPlace('AL MARKET 6077')).toBe('Al Market');
    expect(tidyPlace('PAYPAL *P1A2B3C4D')).toBe('Paypal');
    expect(tidyPlace('Wolt')).toBe('Wolt');
  });

  it('makes one key for the same place written differently', () => {
    expect(placeKey('PIZZA HUT CASPIAN P 2')).toBe('pizza hut caspian p');
  });

  it('guesses a category, and lets a learned rule win', () => {
    expect(guessCategory('Bolt Food', {})).toBe('food');
    expect(guessCategory('Bolt', {})).toBe('transport');
    expect(guessCategory('Azercell', {})).toBe('home');
    expect(guessCategory('Corner Shop', {})).toBe('other');
    expect(guessCategory('Corner Shop', { [placeKey('Corner Shop')]: 'food' })).toBe('food');
  });
});

describe('isNotice', () => {
  it('sets aside offers, links and one-time codes', () => {
    expect(isNotice('Kredit teklif: 10000 AZN-dek')).toBe(true);
    expect(isNotice('Confirm at https://example.com 20 AZN')).toBe(true);
    expect(isNotice('Kod: 482913. 20 AZN odenis')).toBe(true);
    expect(isNotice('Odenis: 12.50 AZN BRAVO')).toBe(false);
  });
});
