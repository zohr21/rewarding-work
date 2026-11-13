import { describe, expect, it } from 'vitest';
import { deviceRegion, englishLocale, regionCurrency } from '../src/lib/i18n/region';

describe('deviceRegion', () => {
  it('takes the region of the first language when it is not the factory en-US', () => {
    expect(deviceRegion(['az-AZ', 'en-US'], 'Asia/Baku')).toBe('AZ');
    expect(deviceRegion(['en-GB'], 'Europe/London')).toBe('GB');
    expect(deviceRegion(['zh-Hant-TW'])).toBe('TW');
  });

  it('believes en-US inside the United States', () => {
    expect(deviceRegion(['en-US', 'es-MX'], 'America/Chicago')).toBe('US');
    expect(deviceRegion(['en-US'], 'Pacific/Honolulu')).toBe('US');
  });

  it('looks past en-US elsewhere: the next language, then the time zone', () => {
    expect(deviceRegion(['en-US', 'az-AZ'], 'Asia/Baku')).toBe('AZ');
    expect(deviceRegion(['en-US'], 'Europe/Istanbul')).toBe('TR');
    expect(deviceRegion(['en-US'], 'Asia/Tokyo')).toBeNull();
  });

  it('falls back to what little it has', () => {
    expect(deviceRegion(['en-US'])).toBe('US');
    expect(deviceRegion(['en'], 'Asia/Baku')).toBe('AZ');
    expect(deviceRegion([])).toBeNull();
  });
});

describe('englishLocale', () => {
  it('keeps the formats of the device in the United States', () => {
    expect(englishLocale(['en-US'], 'America/New_York')).toBeUndefined();
    expect(englishLocale(['en-US'])).toBeUndefined();
  });

  it('uses a regional English as it is', () => {
    expect(englishLocale(['en-IN', 'hi-IN'], 'Asia/Kolkata')).toBe('en-IN');
    expect(englishLocale(['en-AU'], 'Australia/Sydney')).toBe('en-AU');
  });

  it('writes day before month for en-US away from the United States', () => {
    expect(englishLocale(['en-US', 'az-AZ'], 'Asia/Baku')).toBe('en-GB');
    expect(englishLocale(['ru-RU'], 'Europe/Moscow')).toBe('en-GB');
    const d = new Date(2026, 10, 14, 15, 4);
    expect(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(d)).toBe('14/11/2026');
    expect(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit' }).format(d)).toBe('15:04');
  });
});

describe('regionCurrency', () => {
  it('starts with the local currency where Grovyn lists it', () => {
    expect(regionCurrency('AZ')).toBe('AZN');
    expect(regionCurrency('TR')).toBe('TRY');
    expect(regionCurrency('DE')).toBe('EUR');
    expect(regionCurrency('US')).toBe('USD');
  });

  it('says nothing for a region whose currency is not listed', () => {
    expect(regionCurrency('JP')).toBeNull();
    expect(regionCurrency(null)).toBeNull();
  });
});
