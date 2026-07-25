import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFENDERS, DEFENDER_ORDER } from '@game/content/defenders';
import type { DefenderKind } from '@game/types';
import { DefenderDock } from './DefenderDock';

/** Enough to afford anything, so affordability never confounds a test about something else. */
const RICH = Math.max(...DEFENDER_ORDER.map((kind) => DEFENDERS[kind].cost)) + 1;

/** The highest unlock in content, so nothing is locked unless a test asks for it. */
const ALL_UNLOCKED = Math.max(...DEFENDER_ORDER.map((kind) => DEFENDERS[kind].unlock));

const base = {
  energy: RICH,
  selected: null,
  clearedCount: ALL_UNLOCKED,
  onSelect: () => undefined,
};

/** A defender content says is gated, and one it says is not. Derived, so a retune moves both. */
const GATED = DEFENDER_ORDER.find((kind) => DEFENDERS[kind].unlock > 0);
const FREE = DEFENDER_ORDER.find((kind) => DEFENDERS[kind].unlock === 0);

function gated(): DefenderKind {
  if (GATED === undefined) throw new Error('content is expected to gate at least one defender');
  return GATED;
}

function free(): DefenderKind {
  if (FREE === undefined) throw new Error('content is expected to offer one defender from the start');
  return FREE;
}

describe('DefenderDock', () => {
  it('shows every verb content defines, in dock order', () => {
    render(<DefenderDock {...base} />);
    const labels = screen.getAllByTestId('dock-label').map((el) => el.textContent);
    expect(labels).toEqual(DEFENDER_ORDER.map((kind) => DEFENDERS[kind].label));
  });

  it('shows LOCK instead of a price for a defender that is not unlocked yet', () => {
    const kind = gated();
    render(<DefenderDock {...base} clearedCount={DEFENDERS[kind].unlock - 1} />);
    // Exact comparison: toHaveTextContent substring-matches, so '40' would pass against '140'.
    expect(screen.getByTestId(`dock-cost-${kind}`).textContent).toBe('LOCK');
  });

  it('shows the price once the unlock is met', () => {
    const kind = gated();
    render(<DefenderDock {...base} clearedCount={DEFENDERS[kind].unlock} />);
    expect(screen.getByTestId(`dock-cost-${kind}`).textContent).toBe(String(DEFENDERS[kind].cost));
  });

  it('marks an unaffordable price rather than disabling the card', () => {
    const kind = free();
    const onSelect = vi.fn();
    render(<DefenderDock {...base} energy={DEFENDERS[kind].cost - 1} onSelect={onSelect} />);

    const card = screen.getByTestId(`dock-card-${kind}`);
    expect(screen.getByTestId(`dock-cost-${kind}`)).toHaveAttribute('data-affordable', 'false');
    expect(card).not.toBeDisabled();

    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith(kind);
  });

  it('marks a price the player can meet as affordable', () => {
    const kind = free();
    render(<DefenderDock {...base} energy={DEFENDERS[kind].cost} />);
    expect(screen.getByTestId(`dock-cost-${kind}`)).toHaveAttribute('data-affordable', 'true');
  });

  it('marks only the selected card as pressed', () => {
    const selected = free();
    render(<DefenderDock {...base} selected={selected} />);

    for (const kind of DEFENDER_ORDER) {
      expect(screen.getByTestId(`dock-card-${kind}`)).toHaveAttribute(
        'aria-pressed', String(kind === selected),
      );
    }
  });

  it('reports the tapped defender', () => {
    const onSelect = vi.fn();
    const kind = free();
    render(<DefenderDock {...base} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId(`dock-card-${kind}`));
    expect(onSelect).toHaveBeenCalledWith(kind);
  });

  it('ignores a tap on a locked defender', () => {
    const onSelect = vi.fn();
    const kind = gated();
    render(
      <DefenderDock {...base} clearedCount={DEFENDERS[kind].unlock - 1} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByTestId(`dock-card-${kind}`));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
