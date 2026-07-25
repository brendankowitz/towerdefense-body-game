import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

// `ignore: false` reaches past the global ignore that keeps these deliberate
// violations out of the repo-wide lint.
const eslint = new ESLint({ cwd: process.cwd(), ignore: false });

describe('layer boundary lint rule', () => {
  it('rejects a game-layer module importing Pixi', async () => {
    const [result] = await eslint.lintFiles(['tests/lint/fixtures/game-violation.ts']);
    expect(result?.errorCount).toBeGreaterThan(0);
    expect(result?.messages.map((m) => m.ruleId)).toContain('no-restricted-imports');
  });

  it('accepts a game-layer module with no cross-layer import', async () => {
    const [result] = await eslint.lintFiles(['tests/lint/fixtures/game-clean.ts']);
    expect(result?.errorCount).toBe(0);
  });
});
