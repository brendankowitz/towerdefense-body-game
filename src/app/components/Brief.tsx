import type { CaseDefinition } from '@game/content/cases';
import { DEFENDERS, DEFENDER_BLURBS, DEFENDER_ORDER } from '@game/content/defenders';
import { PATHOGENS } from '@game/content/pathogens';
import { IMMUNITY_MAX } from '@game/content/rules';
import { STRAIN_ROWS } from '@game/content/vaccines';
import { palette } from '@theme/tokens';
import type { PathogenKind } from '@game/types';

interface BriefProps {
  readonly definition: CaseDefinition;
  /** Clears banked toward the strain this case credits — profile-derived, passed by the page. */
  readonly strainClears: number;
  readonly onStartCase: () => void;
  readonly onBack: () => void;
}

/** The case brief: region, story, the rule, what's coming, how to stop it, the shield line. */
export function Brief({ definition, strainClears, onStartCase, onBack }: BriefProps) {
  const totals = new Map<PathogenKind, number>();
  for (const wave of definition.waves) {
    for (const entry of wave) totals.set(entry.kind, (totals.get(entry.kind) ?? 0) + entry.count);
  }

  const strainRow = STRAIN_ROWS.find((row) => row.key === definition.credits);
  const shield = strainClears >= IMMUNITY_MAX && strainRow !== undefined
    ? strainRow.heldCopy
    : `No vaccine for this strain yet — ${String(strainClears)} of ${String(IMMUNITY_MAX)} clears done. Earned, never bought.`;

  return (
    <div className="screen rise">
      <div className="screen-body">
        <div className="screen-title">
          <span className="mono kicker">{definition.region}</span>
          <h2 className="screen-heading">{definition.title}</h2>
          <p className="screen-lede">{definition.story}</p>
        </div>

        <div className="rule-card">
          <span className="rule-swatch" />
          <div>
            <span className="rule-name">{definition.ruleLabel}</span>
            <span className="rule-sub">{definition.ruleSub}</span>
          </div>
        </div>

        <section>
          <span className="mono kicker">COMING THROUGH</span>
          {[...totals].map(([kind, count]) => (
            <div key={kind} className="row" data-testid="brief-enemy">
              <span
                className="row-swatch"
                data-shape={PATHOGENS[kind].shape}
                style={{ background: palette[PATHOGENS[kind].token].css }}
              />
              <span className="row-name">{PATHOGENS[kind].name}</span>
              <span className="row-note">{PATHOGENS[kind].note}</span>
              <span className="mono">{`×${String(count)}`}</span>
            </div>
          ))}
        </section>

        <section>
          <span className="mono kicker">WAYS TO STOP THEM</span>
          {DEFENDER_ORDER.map((kind) => (
            <div key={kind} className="row row-stacked" data-testid="brief-verb">
              <span className="row-swatch" style={{ background: palette[DEFENDERS[kind].token].css }} />
              <div className="row-text">
                <span className="row-name">{DEFENDER_BLURBS[kind].name}</span>
                <span className="row-note">{DEFENDER_BLURBS[kind].text}</span>
              </div>
            </div>
          ))}
        </section>

        <div className="shield-card" data-testid="brief-shield">{shield}</div>
      </div>

      <footer className="screen-footer">
        <button type="button" className="primary" data-testid="get-in-there" onClick={onStartCase}>
          Get in there
        </button>
        <button type="button" className="secondary" onClick={onBack}>
          Back to the body
        </button>
      </footer>
    </div>
  );
}
