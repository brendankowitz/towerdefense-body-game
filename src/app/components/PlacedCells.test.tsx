import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { placeDefender, reabsorbValue, startWave, towerAt } from '@game/commands';
import { DEFENDERS, DEFENDER_BLURBS, DEFENDER_ORDER } from '@game/content/defenders';
import { maturedChanges, maturedFormOf, type MaturedForm } from '@game/content/maturation';
import { GameLoop } from '@game/loop';
import { createSimState } from '@game/state';
import type { DefenderKind } from '@game/types';
import { PlacedCells } from './PlacedCells';

/**
 * Enough clears that the season has opened everything — every cell in the dock *and* both matured
 * forms, which are gated on the same counter one tier up. Derived from both tables rather than
 * from the dock alone: reading only `DEFENDERS` left this fixture short of the forms the moment
 * growth became a season unlock, and every maturation test below failed to find its own button.
 */
const ALL_UNLOCKED = Math.max(
  ...DEFENDER_ORDER.map((kind) => Math.max(DEFENDERS[kind].unlock, maturedFormOf(kind)?.unlock ?? 0)),
);

const GROWABLE = DEFENDER_ORDER.filter((kind) => maturedFormOf(kind) !== null);
const UNGROWABLE = DEFENDER_ORDER.filter((kind) => maturedFormOf(kind) === null);

function firstOf(kinds: readonly DefenderKind[], what: string): DefenderKind {
  const [kind] = kinds;
  if (kind === undefined) throw new Error(`content is expected to offer ${what}`);
  return kind;
}

function maturedForm(kind: DefenderKind): MaturedForm {
  const form = maturedFormOf(kind);
  if (form === null) throw new Error(`${kind} is expected to have a matured form`);
  return form;
}

/** A build-phase board with one cell of each kind asked for, and energy to spare. */
function boardOf(...kinds: readonly DefenderKind[]): GameLoop {
  const state = createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0 },
    day: ALL_UNLOCKED + 1,
    totalKills: 0,
  });
  state.energy = Number.MAX_SAFE_INTEGER;
  kinds.forEach((kind, spot) => {
    state.selected = kind;
    if (!placeDefender(state, spot)) throw new Error(`Could not place ${kind} on spot ${String(spot)}`);
  });
  return new GameLoop(state);
}

/**
 * The row is controlled: the page owns which cell is open so that a tap on the board can open
 * one too. This host stands in for the page.
 */
function Host({ loop }: { readonly loop: GameLoop }) {
  const [chosenSpot, setChosenSpot] = useState<number | null>(null);
  return <PlacedCells loop={loop} chosenSpot={chosenSpot} onChoose={setChosenSpot} />;
}

describe('PlacedCells', () => {
  it('has a defender with a matured form and one without, or the cases below are vacuous', () => {
    expect(GROWABLE.length).toBeGreaterThan(0);
    expect(UNGROWABLE.length).toBeGreaterThan(0);
  });

  it('lists a chip for every cell on the board', () => {
    const kinds = [firstOf(GROWABLE, 'a cell that can be grown'), firstOf(UNGROWABLE, 'a cell that cannot')];
    const loop = boardOf(...kinds);

    render(<Host loop={loop} />);

    for (const [spot] of kinds.entries()) {
      expect(screen.getByTestId(`cell-chip-${String(spot)}`)).toBeInTheDocument();
    }
  });

  it('says nothing about actions until a cell is chosen', () => {
    const loop = boardOf(firstOf(GROWABLE, 'a cell that can be grown'));
    render(<Host loop={loop} />);
    expect(screen.queryByTestId('cell-actions')).not.toBeInTheDocument();
  });

  it('offers the refund the simulation would actually pay', () => {
    const kind = firstOf(GROWABLE, 'a cell that can be grown');
    const loop = boardOf(kind);
    const tower = towerAt(loop.state, 0);
    expect(tower).not.toBeNull();
    if (tower === null) return;

    render(<Host loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));

    expect(screen.getByTestId('reabsorb').textContent)
      .toBe(`Reabsorb+${String(reabsorbValue(tower))}`);
  });

  it('takes the cell back off the board when reabsorb is tapped', () => {
    const kind = firstOf(GROWABLE, 'a cell that can be grown');
    const loop = boardOf(kind);
    const before = loop.state.energy;
    const tower = towerAt(loop.state, 0);
    expect(tower).not.toBeNull();
    if (tower === null) return;
    const refund = reabsorbValue(tower);

    render(<Host loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));
    fireEvent.click(screen.getByTestId('reabsorb'));

    expect(loop.state.towers).toHaveLength(0);
    expect(loop.state.energy).toBe(before + refund);
    expect(screen.queryByTestId('cell-chip-0')).not.toBeInTheDocument();
  });

  it('names the form a cell can grow into, and what it costs', () => {
    const kind = firstOf(GROWABLE, 'a cell that can be grown');
    const form = maturedForm(kind);
    const loop = boardOf(kind);

    render(<Host loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));

    expect(screen.getByTestId('mature').textContent).toBe(`${form.name}−${String(form.cost)}`);
  });

  /**
   * The offer used to be a name and a price. A matured form is a trade, and one of them was a
   * trap for a whole tuning pass precisely because no screen said what it moved.
   *
   * Every growable kind, not the first one: the forms move different stats between them, spelled
   * in different units — a reach is a bare number, a pause is seconds, a bite is per second — so a
   * case that opened one cell would have proved the row renders and nothing about what it renders.
   */
  it('shows every stat the growth moves, and the numbers content actually carries', () => {
    render(<Host loop={boardOf(...GROWABLE)} />);

    GROWABLE.forEach((kind, spot) => {
      fireEvent.click(screen.getByTestId(`cell-chip-${String(spot)}`));
      const changes = maturedChanges(kind);
      expect(changes.length, `${kind}'s form moves no stat, so this case asserts nothing`)
        .toBeGreaterThan(0);

      const text = screen.getByTestId('mature-trade').textContent;
      for (const change of changes) {
        expect(text).toContain(`${change.label}${change.from} → ${change.to}`);
      }
    });
  });

  /**
   * Grouped under headings rather than told apart by colour. Both sides are always present —
   * `maturation.invariants.test.ts` holds every form to moving at least one stat each way — so a
   * heading that never renders is a trade the player only sees half of.
   */
  it('sorts the trade into what the growth gains and what it gives up', () => {
    render(<Host loop={boardOf(...GROWABLE)} />);

    GROWABLE.forEach((kind, spot) => {
      fireEvent.click(screen.getByTestId(`cell-chip-${String(spot)}`));
      const changes = maturedChanges(kind);

      for (const gain of [true, false]) {
        const side = changes.filter((change) => change.gain === gain);
        expect(side.length, `${kind}'s form moves nothing that counts as ${gain ? 'a gain' : 'a cost'}`)
          .toBeGreaterThan(0);
        const row = screen.getByTestId('mature-trade')
          .querySelector(`[data-gain='${String(gain)}']`)?.textContent ?? '';
        for (const change of side) expect(row).toContain(change.label);
        for (const other of changes.filter((change) => change.gain !== gain)) {
          expect(row).not.toContain(other.label);
        }
      }
    });
  });

  /**
   * The panel says which of the five cells it is acting on. A player who opened this by tapping
   * the board never looked at the chip row, so a Reabsorb button with nothing naming its cell is
   * two buttons and a guess.
   */
  it('names the cell whose actions are open', () => {
    const kind = firstOf(GROWABLE, 'a cell with a form');
    render(<Host loop={boardOf(kind)} />);
    expect(screen.queryByTestId('cell-open')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cell-chip-0'));

    const open = screen.getByTestId('cell-open');
    expect(open).toHaveTextContent(DEFENDER_BLURBS[kind].name.split(' · ')[0] ?? '');
  });

  it('renames the open cell when the form is taken, so the panel follows what it became', () => {
    const kind = firstOf(GROWABLE, 'a cell with a form');
    render(<Host loop={boardOf(kind)} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));
    fireEvent.click(screen.getByTestId('mature'));

    expect(screen.getByTestId('cell-open')).toHaveTextContent(maturedForm(kind).name);
  });

  it('stops offering a trade once there is nothing left to trade for', () => {
    const grown = boardOf(firstOf(GROWABLE, 'a cell that can be grown'));
    render(<Host loop={grown} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));
    expect(screen.getByTestId('mature-trade')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mature'));
    expect(screen.queryByTestId('mature-trade')).not.toBeInTheDocument();
  });

  it('grows the cell and renames the chip when the form is taken', () => {
    const kind = firstOf(GROWABLE, 'a cell that can be grown');
    const form = maturedForm(kind);
    const loop = boardOf(kind);
    const before = loop.state.energy;

    render(<Host loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));
    fireEvent.click(screen.getByTestId('mature'));

    expect(towerAt(loop.state, 0)?.matured).toBe(true);
    expect(loop.state.energy).toBe(before - form.cost);
    expect(screen.getByTestId('cell-chip-0').textContent).toBe(form.name);
    expect(screen.queryByTestId('mature')).not.toBeInTheDocument();
  });

  it('refuses to offer a form the player cannot pay for', () => {
    const kind = firstOf(GROWABLE, 'a cell that can be grown');
    const form = maturedForm(kind);
    const loop = boardOf(kind);
    loop.state.energy = form.cost - 1;

    render(<Host loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));

    const button = screen.getByTestId('mature');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(towerAt(loop.state, 0)?.matured).toBe(false);
  });

  it('says so plainly when a cell has nowhere left to grow', () => {
    const kind = firstOf(UNGROWABLE, 'a cell that cannot be grown');
    const loop = boardOf(kind);

    render(<Host loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));

    expect(screen.queryByTestId('mature')).not.toBeInTheDocument();
    expect(screen.getByTestId('reabsorb')).toBeInTheDocument();
  });

  it('is absent while a wave is running', () => {
    const loop = boardOf(firstOf(GROWABLE, 'a cell that can be grown'));
    startWave(loop.state);
    loop.publish();

    render(<Host loop={loop} />);
    expect(screen.queryByTestId('placed-cells')).not.toBeInTheDocument();
  });

  /** Both cells, so the growth offer and everything it spells out are inside the rule too. */
  it('never exclaims, and never uses an emoji — spec copy rules', () => {
    const kinds = [
      firstOf(UNGROWABLE, 'a cell that cannot be grown'),
      firstOf(GROWABLE, 'a cell that can be grown'),
    ];

    kinds.forEach((_kind, spot) => {
      const { container, unmount } = render(<Host loop={boardOf(...kinds)} />);
      fireEvent.click(screen.getByTestId(`cell-chip-${String(spot)}`));

      const text = container.textContent;
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('!');
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      unmount();
    });
  });
});
