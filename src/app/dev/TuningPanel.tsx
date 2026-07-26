import { useState } from 'react';
import { DEFENDER_ORDER, DEFENDERS } from '@game/content/defenders';
import { MATURED_FORMS } from '@game/content/maturation';
import { PATHOGENS } from '@game/content/pathogens';
import { CASE_BY_ID } from '@game/content/cases';
import {
  applyDefenderTuning, applyMaturationTuning, applyPathogenTuning, applyWaveTuning,
  exportContentModules, resetTuning, type MaturationField,
} from '@game/content/tuning';
import type { GameLoop } from '@game/loop';
import type { DefenderKind, PathogenKind } from '@game/types';
import './tuning.css';

const PATHOGEN_ORDER = Object.keys(PATHOGENS) as readonly PathogenKind[];

/** Dock order, restricted to the cells that have something to grow into. */
const GROWN_ORDER = DEFENDER_ORDER.filter((kind) => MATURED_FORMS[kind] !== undefined);

/** Fields that read as a rate or a fraction get a finer step; everything else moves by whole units. */
const FINE_STEP_FIELDS = new Set(['rate', 'gap', 'rest', 'slow', 'armour', 'execute', 'stun']);

function stepFor(field: string): string {
  return FINE_STEP_FIELDS.has(field) ? '0.1' : '1';
}

interface TuningPanelProps {
  readonly loop: GameLoop;
}

/**
 * Dev-only overlay that moves defender, pathogen and wave-composition numbers against the
 * running simulation (spec §4.1). Every field writes straight through `tuning.ts`'s guarded
 * API onto the live content tables the systems already read, so a change is felt on the very
 * next simulation step. `tick` exists only to force this component to re-render after such a
 * mutation — the tables themselves hold the state, not React.
 */
export function TuningPanel({ loop }: TuningPanelProps) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = (): void => {
    setTick((t) => t + 1);
    loop.publish();
  };

  /**
   * `Number('')` is `0`, not `NaN` — an input mid-edit (cleared, or holding a value the
   * browser's own number-input sanitisation rejected down to an empty string) must be a
   * no-op, never a silent write of zero.
   */
  function parseField(raw: string): number | null {
    if (raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  const onDefenderField = (kind: DefenderKind, field: string, raw: string): void => {
    const value = parseField(raw);
    if (value === null) return;
    applyDefenderTuning(kind, { [field]: value });
    refresh();
  };

  const onMaturationField = (kind: DefenderKind, field: MaturationField, raw: string): void => {
    const value = parseField(raw);
    if (value === null) return;
    applyMaturationTuning(kind, { [field]: value });
    refresh();
  };

  const onPathogenField = (kind: PathogenKind, field: string, raw: string): void => {
    const value = parseField(raw);
    if (value === null) return;
    applyPathogenTuning(kind, { [field]: value });
    refresh();
  };

  const onWaveStep = (waveIndex: number, kind: PathogenKind, count: number, delta: number): void => {
    const next = count + delta;
    if (next < 0) return;
    applyWaveTuning(loop.state.caseId, waveIndex, kind, next);
    refresh();
  };

  const copy = (label: string, text: string): void => {
    navigator.clipboard.writeText(text).then(
      () => { setStatus(`${label} copied to clipboard`); },
      () => { setStatus(`${label} could not reach the clipboard`); },
    );
  };

  const onReset = (): void => {
    resetTuning();
    setStatus('Reset to seed values');
    refresh();
  };

  if (!open) {
    return (
      <button
        type="button"
        className="tuning-handle"
        data-testid="tuning-handle"
        onClick={() => { setOpen(true); }}
      >
        TUNE
      </button>
    );
  }

  const currentCase = CASE_BY_ID[loop.state.caseId];

  return (
    <aside className="tuning-panel" data-testid="tuning-panel">
      <div className="tuning-panel-head">
        <span className="tuning-panel-title">TUNING — {currentCase.id.toUpperCase()}</span>
        <button
          type="button"
          className="tuning-panel-close"
          data-testid="tuning-close"
          onClick={() => { setOpen(false); }}
        >
          Close
        </button>
      </div>

      <div className="tuning-panel-body">
        <details open>
          <summary>Defenders</summary>
          {DEFENDER_ORDER.map((kind) => {
            const stats = DEFENDERS[kind];
            return (
              <details key={kind} data-testid={`tuning-defender-${kind}`}>
                <summary>{stats.label}</summary>
                {Object.entries(stats)
                  .filter(([, value]) => typeof value === 'number')
                  .map(([field, value]) => (
                    <label key={field} className="tuning-row">
                      <span className="tuning-row-label">{field}</span>
                      <input
                        type="number"
                        step={stepFor(field)}
                        value={value as number}
                        data-testid={`tuning-defender-${kind}-${field}`}
                        onChange={(event) => { onDefenderField(kind, field, event.target.value); }}
                      />
                    </label>
                  ))}
              </details>
            );
          })}
        </details>

        {/*
          A grown cell fights with its base stats *overridden* by these, so a row here is the
          only way to move what a macrophage, a fibrin mesh or a high-affinity antibody actually
          does — tuning `phago.range` above leaves the macrophage exactly where it was. Only the
          stats a form overrides are listed: everything else it fights with comes from the
          defender section, one panel up.
        */}
        <details open>
          <summary>Matured forms</summary>
          {GROWN_ORDER.map((kind) => {
            const form = MATURED_FORMS[kind];
            if (form === undefined) return null;
            const fields: readonly (readonly [MaturationField, number])[] = [
              ['cost', form.cost],
              ...Object.entries(form.stats).map(
                ([field, value]) => [field as MaturationField, value] as const,
              ),
            ];
            return (
              <details key={kind} data-testid={`tuning-matured-${kind}`}>
                <summary>{form.name}</summary>
                {fields.map(([field, value]) => (
                  <label key={field} className="tuning-row">
                    <span className="tuning-row-label">{field}</span>
                    <input
                      type="number"
                      step={stepFor(field)}
                      value={value}
                      data-testid={`tuning-matured-${kind}-${field}`}
                      onChange={(event) => { onMaturationField(kind, field, event.target.value); }}
                    />
                  </label>
                ))}
              </details>
            );
          })}
        </details>

        <details open>
          <summary>Pathogens</summary>
          {PATHOGEN_ORDER.map((kind) => {
            const stats = PATHOGENS[kind];
            return (
              <details key={kind} data-testid={`tuning-pathogen-${kind}`}>
                <summary>{stats.name}</summary>
                {Object.entries(stats)
                  .filter(([, value]) => typeof value === 'number')
                  .map(([field, value]) => (
                    <label key={field} className="tuning-row">
                      <span className="tuning-row-label">{field}</span>
                      <input
                        type="number"
                        step={stepFor(field)}
                        value={value as number}
                        data-testid={`tuning-pathogen-${kind}-${field}`}
                        onChange={(event) => { onPathogenField(kind, field, event.target.value); }}
                      />
                    </label>
                  ))}
              </details>
            );
          })}
        </details>

        <details open>
          <summary>Wave composition — {currentCase.title}</summary>
          {currentCase.waves.map((wave, waveIndex) => (
            <div key={`wave-${String(waveIndex)}`}>
              <div className="tuning-row-label">Wave {String(waveIndex + 1)}</div>
              {wave.map((entry) => (
                <div key={entry.kind} className="tuning-wave-row">
                  <span className="tuning-wave-kind">{entry.kind}</span>
                  <button
                    type="button"
                    className="tuning-stepper"
                    data-testid={`tuning-wave-${String(waveIndex)}-${entry.kind}-dec`}
                    onClick={() => { onWaveStep(waveIndex, entry.kind, entry.count, -1); }}
                  >
                    −
                  </button>
                  <span
                    className="tuning-wave-count"
                    data-testid={`tuning-wave-${String(waveIndex)}-${entry.kind}-count`}
                  >
                    {entry.count}
                  </span>
                  <button
                    type="button"
                    className="tuning-stepper"
                    data-testid={`tuning-wave-${String(waveIndex)}-${entry.kind}-inc`}
                    onClick={() => { onWaveStep(waveIndex, entry.kind, entry.count, 1); }}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          ))}
        </details>
      </div>

      {status !== null && <div className="tuning-panel-status">{status}</div>}

      <div className="tuning-panel-actions">
        <button
          type="button"
          data-testid="tuning-copy-defenders"
          onClick={() => { copy('defenders.ts', exportContentModules().defenders); }}
        >
          Copy defenders.ts
        </button>
        <button
          type="button"
          data-testid="tuning-copy-maturation"
          onClick={() => { copy('maturation.ts', exportContentModules().maturation); }}
        >
          Copy maturation.ts
        </button>
        <button
          type="button"
          data-testid="tuning-copy-pathogens"
          onClick={() => { copy('pathogens.ts', exportContentModules().pathogens); }}
        >
          Copy pathogens.ts
        </button>
        <button type="button" data-testid="tuning-reset" onClick={onReset}>
          Reset to seeds
        </button>
      </div>
    </aside>
  );
}
