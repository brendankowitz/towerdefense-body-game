import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { palette, type PaletteToken } from './tokens';

// Vitest's transform does not give this module a file: import.meta.url, so the
// stylesheet is read relative to the project root instead.
const css = readFileSync(resolve(process.cwd(), 'src/theme/variables.css'), 'utf8');

function cssVariableName(token: string): string {
  return `--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

describe('palette', () => {
  it('declares every token as a CSS custom property with an identical value', () => {
    for (const [token, { css: value }] of Object.entries(palette)) {
      const declaration = `${cssVariableName(token)}: ${value};`;
      expect(css, `variables.css is missing "${declaration}"`).toContain(declaration);
    }
  });

  it('resolves the five spec role tokens to the documented values', () => {
    const roles: Record<string, string> = {
      threat: 'oklch(0.66 0.15 25)',
      frontline: 'oklch(0.66 0.15 195)',
      support: 'oklch(0.7 0.14 145)',
      control: 'oklch(0.45 0.14 320)',
      energy: 'oklch(0.78 0.13 80)',
    };
    for (const [token, value] of Object.entries(roles)) {
      expect(palette[token as PaletteToken].css).toBe(value);
    }
  });
});
