import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TISSUE_PIPS } from '@game/content/rules';
import { TissuePips } from './TissuePips';

function litCount(): number {
  return screen.getAllByTestId('pip').filter((pip) => pip.dataset['lit'] === 'true').length;
}

describe('TissuePips', () => {
  it('always shows every pip as a discrete life, never a percentage', () => {
    render(<TissuePips tissue={TISSUE_PIPS - 2} />);
    expect(screen.getAllByTestId('pip')).toHaveLength(TISSUE_PIPS);
  });

  it('greys exactly one pip per leak so the cost is countable', () => {
    const { rerender } = render(<TissuePips tissue={TISSUE_PIPS} />);
    expect(litCount()).toBe(TISSUE_PIPS);

    rerender(<TissuePips tissue={TISSUE_PIPS - 1} />);
    expect(litCount()).toBe(TISSUE_PIPS - 1);

    rerender(<TissuePips tissue={TISSUE_PIPS - 2} />);
    expect(litCount()).toBe(TISSUE_PIPS - 2);
  });

  it('labels the count for a screen reader', () => {
    render(<TissuePips tissue={TISSUE_PIPS - 1} />);
    expect(
      screen.getByText(`TISSUE ${String(TISSUE_PIPS - 1)}/${String(TISSUE_PIPS)}`),
    ).toBeInTheDocument();
  });

  it('shows nothing lit at zero rather than a negative count', () => {
    render(<TissuePips tissue={-1} />);
    expect(litCount()).toBe(0);
    expect(screen.getByText(`TISSUE 0/${String(TISSUE_PIPS)}`)).toBeInTheDocument();
  });

  it('never reports more tissue than the body has', () => {
    render(<TissuePips tissue={TISSUE_PIPS + 3} />);
    expect(screen.getAllByTestId('pip')).toHaveLength(TISSUE_PIPS);
    expect(litCount()).toBe(TISSUE_PIPS);
    expect(
      screen.getByText(`TISSUE ${String(TISSUE_PIPS)}/${String(TISSUE_PIPS)}`),
    ).toBeInTheDocument();
  });
});
