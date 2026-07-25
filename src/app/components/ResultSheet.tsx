import { CASE_CLEAR_BANK, WAVE_CLEAR_ENERGY } from '@game/content/rules';
import { palette } from '@theme/tokens';
import type { ResultKind } from '@game/types';
import { RiseSheet } from './RiseSheet';

interface ResultSheetProps {
  readonly result: ResultKind;
  readonly waveIndex: number;
  readonly waveCount: number;
  readonly kills: number;
  readonly leaks: number;
  readonly caseTitle: string;
  readonly onPrimary: () => void;
  readonly onLeave: () => void;
}

interface Copy {
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  readonly cta: string;
  readonly accent: string;
  readonly reward: string;
  readonly canLeave: boolean;
}

/**
 * The reward line reports what was actually awarded rather than a fixed `+50` (decision D5),
 * and it reads the constant rather than restating it: a tuning pass moves both together.
 */
function copyFor(props: ResultSheetProps): Copy {
  const wave = props.waveIndex + 1;

  switch (props.result) {
    case 'wave':
      return {
        kicker: `WAVE ${String(wave)} OF ${String(props.waveCount)} HELD`,
        title: 'Swelling going down.',
        body: 'Build before the next one arrives. Unspent energy carries over.',
        cta: `Build for wave ${String(wave + 1)}`,
        accent: palette.frontline.css,
        reward: `+${String(WAVE_CLEAR_ENERGY)}`,
        canLeave: true,
      };
    case 'case':
      return {
        kicker: `${props.caseTitle.toUpperCase()} CLEARED`,
        title: 'The region is yours.',
        body: 'Tissue is closing on its own now. Immunity to this strain went up.',
        cta: 'Back to the body',
        accent: palette.support.css,
        reward: `+${String(CASE_CLEAR_BANK)}`,
        canLeave: false,
      };
    case 'lost':
      return {
        kicker: `TISSUE FAILED · WAVE ${String(wave)}`,
        title: 'It got into the blood.',
        body: 'The region is lost. Take the case again — you keep what you learned.',
        cta: 'Try this case again',
        accent: palette.threat.css,
        reward: '0',
        canLeave: true,
      };
  }
}

/**
 * The prototype's titles carried a hard newline (lines 1018–1020). Here the break is CSS
 * (`text-wrap: balance`), so the sentence reads correctly to a screen reader.
 */
export function ResultSheet(props: ResultSheetProps) {
  const copy = copyFor(props);

  return (
    <RiseSheet>
      <div className="result-head">
        <span
          className="mono result-kicker"
          data-testid="result-kicker"
          style={{ color: copy.accent }}
        >
          {copy.kicker}
        </span>
        <h2 className="result-title" data-testid="result-title">{copy.title}</h2>
        <p className="result-body">{copy.body}</p>
      </div>

      <div className="result-stats">
        <div className="result-stat">
          <span className="mono result-figure" data-testid="result-kills">{String(props.kills)}</span>
          <span className="result-caption">Cleared</span>
        </div>
        <div className="result-stat">
          <span className="mono result-figure result-leaks" data-testid="result-leaks">
            {String(props.leaks)}
          </span>
          <span className="result-caption">Got through</span>
        </div>
        <div className="result-stat result-stat-energy">
          <span className="mono result-figure" data-testid="result-reward">{copy.reward}</span>
          <span className="result-caption">Energy</span>
        </div>
      </div>

      <div className="result-actions">
        <button
          type="button"
          className="fight-primary"
          data-testid="result-cta"
          style={{ background: copy.accent }}
          onClick={props.onPrimary}
        >
          {copy.cta}
        </button>
        {copy.canLeave && (
          <button
            type="button"
            className="fight-secondary"
            data-testid="result-leave"
            onClick={props.onLeave}
          >
            Leave the region
          </button>
        )}
      </div>
    </RiseSheet>
  );
}
