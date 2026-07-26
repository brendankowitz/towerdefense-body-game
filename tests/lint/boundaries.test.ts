import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Spec criterion 8, enforced by `eslint.config.js`'s `src/game/**` block and asserted here.
 *
 * The fixtures live under `src/game/__fixtures__/` because that is the only path the block
 * matches. An earlier version kept them under `tests/lint/fixtures/`, which had a block of its
 * own restating a subset of the restrictions — so deleting the entire `src/game/**` block from
 * the config left both tests green. `ignore: false` reaches past the global ignore that keeps
 * the deliberate violations out of the repo-wide lint.
 */
const eslint = new ESLint({ cwd: process.cwd(), ignore: false });

async function lintFixture(file: string): Promise<ESLint.LintResult> {
  const [result] = await eslint.lintFiles([`src/game/__fixtures__/${file}`]);
  if (result === undefined) throw new Error(`eslint returned no result for ${file}`);
  return result;
}

describe('layer boundary lint rule', () => {
  it('rejects a game-layer module that reaches outside the simulation', async () => {
    const result = await lintFixture('boundary-violation.ts');
    const rules = result.messages.map((message) => message.ruleId);

    // A parse failure raises errorCount too, and would satisfy a bare "it errored" assertion
    // while proving nothing — so every rule the block applies is named, and a null ruleId
    // (which is what a parse failure reports) fails outright.
    expect(rules, JSON.stringify(result.messages)).not.toContain(null);
    expect(rules).toContain('no-restricted-imports');
    expect(rules).toContain('no-restricted-globals');
    expect(rules).toContain('no-restricted-properties');
  });

  it('accepts a game-layer module that stays inside its layer', async () => {
    const result = await lintFixture('boundary-clean.ts');
    expect(result.messages.map((message) => `${String(message.ruleId)}: ${message.message}`))
      .toEqual([]);
  });
});
