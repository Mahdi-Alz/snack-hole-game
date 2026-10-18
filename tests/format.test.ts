import { describe, expect, it } from 'vitest';
import { formatDuration, formatNumber, formatPercent, formatRate } from '../src/core/format';

describe('formatNumber', () => {
  it('keeps small numbers whole', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(7.9)).toBe('7');
    expect(formatNumber(999)).toBe('999');
  });

  it('uses suffixes with three significant digits', () => {
    expect(formatNumber(1234)).toBe('1.23K');
    expect(formatNumber(45_600_000)).toBe('45.6M');
    expect(formatNumber(7_890_000_000)).toBe('7.89B');
    expect(formatNumber(123e12)).toBe('123T');
    expect(formatNumber(1e15)).toBe('1.00Qa');
    expect(formatNumber(2.5e18)).toBe('2.50Qi');
  });

  it('rolls over to the next suffix instead of printing 1000K', () => {
    expect(formatNumber(999_999)).toBe('1.00M');
    expect(formatNumber(999_499)).toBe('999K');
  });

  it('switches to scientific past Qi or when requested', () => {
    expect(formatNumber(1.234e21)).toBe('1.23e21');
    expect(formatNumber(1234, true)).toBe('1.23e3');
    expect(formatNumber(9.999e5, true)).toBe('1.00e6');
  });

  it('handles negatives and infinity', () => {
    expect(formatNumber(-1500)).toBe('-1.50K');
    expect(formatNumber(Infinity)).toBe('∞');
  });
});

describe('other formatters', () => {
  it('formats rates with decimals when small', () => {
    expect(formatRate(0.4)).toBe('0.40');
    expect(formatRate(12.34)).toBe('12.3');
    expect(formatRate(2500)).toBe('2.50K');
  });

  it('formats durations', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1h 02m');
  });

  it('formats percent without showing 100% early', () => {
    expect(formatPercent(0.123)).toBe('12.3%');
    expect(formatPercent(0.99996)).toBe('99.9%');
    expect(formatPercent(1)).toBe('100.0%');
  });
});
