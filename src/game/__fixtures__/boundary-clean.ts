// The mirror image of boundary-violation.ts: a game-layer module that stays inside its layer.
// Without it, a fixture path that no longer reaches the rule would look like a passing test.
export const add = (a: number, b: number): number => a + b;
