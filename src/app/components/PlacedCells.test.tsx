import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { placeDefender, reabsorbValue, startWave, towerAt } from '@game/commands';
import { DEFENDERS, DEFENDER_ORDER } from '@game/content/defenders';
import { maturedFormOf, type MaturedForm } from '@game/content/maturation';
import { GameLoop } from '@game/loop';
import { createSimState } from '@game/state';
import type { DefenderKind } from '@game/types';
import { PlacedCells } from './PlacedCells';

const ALL_UNLOCKED = Math.max(...DEFENDER_ORDER.map((kind) => DEFENDERS[kind].unlock));

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
    clearedCount: ALL_UNLOCKED,
    totalKills: 0,
  });
  state.energy = Number.MAX_SAFE_INTEGER;
  kinds.forEach((kind, spot) => {
    state.selected = kind;
    if (!placeDefender(state, spot)) throw new Error(`Could not place ${kind} on spot ${String(spot)}`);
  });
  return new GameLoop(state);
}

describe('PlacedCells', () => {
  it('has a defender with a matured form and one without, or the cases below are vacuous', () => {
    expect(GROWABLE.length).toBeGreaterThan(0);
    expect(UNGROWABLE.length).toBeGreaterThan(0);
  });

  it('lists a chip for every cell on the board', () => {
    const kinds = [firstOf(GROWABLE, 'a cell that can be grown'), firstOf(UNGROWABLE, 'a cell that cannot')];
    const loop = boardOf(...kinds);

    render(<PlacedCells loop={loop} />);

    for (const [spot] of kinds.entries()) {
      expect(screen.getByTestId(`cell-chip-${String(spot)}`)).toBeInTheDocument();
    }
  });

  it('says nothing about actions until a cell is chosen', () => {
    const loop = boardOf(firstOf(GROWABLE, 'a cell that can be grown'));
    render(<PlacedCells loop={loop} />);
    expect(screen.queryByTestId('cell-actions')).not.toBeInTheDocument();
  });

  it('offers the refund the simulation would actually pay', () => {
    const kind = firstOf(GROWABLE, 'a cell that can be grown');
    const loop = boardOf(kind);
    const tower = towerAt(loop.state, 0);
    expect(tower).not.toBeNull();
    if (tower === null) return;

    render(<PlacedCells loop={loop} />);
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

    render(<PlacedCells loop={loop} />);
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

    render(<PlacedCells loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));

    expect(screen.getByTestId('mature').textContent).toBe(`${form.name}−${String(form.cost)}`);
  });

  it('grows the cell and renames the chip when the form is taken', () => {
    const kind = firstOf(GROWABLE, 'a cell that can be grown');
    const form = maturedForm(kind);
    const loop = boardOf(kind);
    const before = loop.state.energy;

    render(<PlacedCells loop={loop} />);
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

    render(<PlacedCells loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));

    const button = screen.getByTestId('mature');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(towerAt(loop.state, 0)?.matured).toBe(false);
  });

  it('says so plainly when a cell has nowhere left to grow', () => {
    const kind = firstOf(UNGROWABLE, 'a cell that cannot be grown');
    const loop = boardOf(kind);

    render(<PlacedCells loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));

    expect(screen.queryByTestId('mature')).not.toBeInTheDocument();
    expect(screen.getByTestId('reabsorb')).toBeInTheDocument();
  });

  it('is absent while a wave is running', () => {
    const loop = boardOf(firstOf(GROWABLE, 'a cell that can be grown'));
    startWave(loop.state);
    loop.publish();

    render(<PlacedCells loop={loop} />);
    expect(screen.queryByTestId('placed-cells')).not.toBeInTheDocument();
  });

  it('never exclaims, and never uses an emoji — spec copy rules', () => {
    const loop = boardOf(firstOf(UNGROWABLE, 'a cell that cannot be grown'));
    const { container } = render(<PlacedCells loop={loop} />);
    fireEvent.click(screen.getByTestId('cell-chip-0'));

    const text = container.textContent;
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('!');
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
