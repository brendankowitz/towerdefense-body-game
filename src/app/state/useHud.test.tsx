import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { selectDefender, startWave } from '@game/commands';
import { GameLoop, type HudSnapshot } from '@game/loop';
import { createSimState } from '@game/state';
import { useHud } from './useHud';

function newLoop(): GameLoop {
  return new GameLoop(createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0 },
    clearedCount: 0,
    totalKills: 0,
  }));
}

function Probe({ loop }: { readonly loop: GameLoop | null }) {
  const hud = useHud(loop);
  return <span data-testid="phase">{hud.phase}</span>;
}

describe('useHud', () => {
  it('reads the loop it is given', () => {
    const loop = newLoop();
    render(<Probe loop={loop} />);
    expect(screen.getByTestId('phase').textContent).toBe(loop.getSnapshot().phase);
  });

  it('re-renders when the loop publishes a change', () => {
    const loop = newLoop();
    render(<Probe loop={loop} />);
    expect(screen.getByTestId('phase').textContent).toBe('build');

    act(() => {
      startWave(loop.state);
      loop.publish();
    });

    expect(screen.getByTestId('phase').textContent).toBe('wave');
  });

  it('does not re-render when a command changed nothing the HUD shows', () => {
    const loop = newLoop();
    const commits: string[] = [];

    function Counter() {
      const hud = useHud(loop);
      useEffect(() => { commits.push(hud.phase); });
      return null;
    }

    render(<Counter />);
    const before = commits.length;

    act(() => {
      // Rejected by the command: the memory cell is gated behind clears this profile lacks.
      selectDefender(loop.state, 'mem');
      loop.publish();
    });

    expect(commits.length).toBe(before);
  });

  it('hands out one idle snapshot rather than a new object per read', () => {
    const seen: HudSnapshot[] = [];

    function Recorder({ tick }: { readonly tick: number }) {
      seen.push(useHud(null));
      return <span data-testid="tick">{String(tick)}</span>;
    }

    // A getSnapshot that builds a fresh object every call makes useSyncExternalStore loop
    // forever, so this is the assertion that keeps the null case from hanging the app.
    const { rerender } = render(<Recorder tick={0} />);
    rerender(<Recorder tick={1} />);

    expect(seen.length).toBeGreaterThan(1);
    const [first] = seen;
    expect(seen.every((snapshot) => snapshot === first)).toBe(true);
  });
});
