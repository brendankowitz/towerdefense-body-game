import { describe, expect, it } from 'vitest';
import { oklchToSrgbHex } from './oklch';

describe('oklchToSrgbHex', () => {
  it('maps the white anchor', () => {
    expect(oklchToSrgbHex('oklch(1 0 0)')).toBe(0xffffff);
  });

  it('maps the black anchor', () => {
    expect(oklchToSrgbHex('oklch(0 0 0)')).toBe(0x000000);
  });

  it('maps the sRGB red anchor', () => {
    expect(oklchToSrgbHex('oklch(0.62796 0.25768 29.234)')).toBe(0xff0000);
  });

  it('ignores a trailing alpha component', () => {
    expect(oklchToSrgbHex('oklch(1 0 0 / 0.5)')).toBe(0xffffff);
  });

  it('rejects a string that is not oklch', () => {
    expect(() => oklchToSrgbHex('#ff0000')).toThrow(/oklch/i);
  });
});
