import { arrivalKindFor, strainOf } from '@game/arrivals';
import { caseHasRule, type CaseDefinition } from '@game/content/cases';
import { DEFENDERS, DEFENDER_BLURBS, DEFENDER_ORDER } from '@game/content/defenders';
import { PATHOGENS } from '@game/content/pathogens';
import { ARRIVALS_ENABLED, IMMUNITY_MAX } from '@game/content/rules';
import { STRAIN_ROWS } from '@game/content/vaccines';
import { palette } from '@theme/tokens';
import type { PathogenKind, StrainId } from '@game/types';

interface BriefProps {
  readonly definition: CaseDefinition;
  /** Clears banked toward the strain this case credits — profile-derived, passed by the page. */
  readonly strainClears: number;
  /**
   * What the profile's immunity reads as *on this board*: the amnesia mask already applied, from
   * the same `immunityFor` the simulation is built with. Profile-derived and passed by the page,
   * like `strainClears` — this screen never sees a `Profile`.
   */
  readonly memory: Readonly<Record<StrainId, number>>;
  readonly onStartCase: () => void;
  readonly onBack: () => void;
}

/** What memory will send against a wave table, when it will send anything at all. */
type MemoryResponse = 'marks' | 'killers';

/**
 * The two answers, and the second is the first with teeth — `arrivalKindFor` is what decides
 * which, so a call at full memory that can only ever buy an antibody says "marks" here without a
 * word of this copy changing.
 */
const MEMORY_COPY: Readonly<Record<MemoryResponse, string>> = {
  marks: 'Your body remembers some of what is coming. Tag bodies and help arrives — antibodies that mark, and nothing that kills.',
  killers: 'Your body remembers some of what is coming. Tag bodies and help arrives — antibodies that mark, and killers for what is already marked.',
};

/**
 * What memory will send against *this* case's wave table, or nothing at all.
 *
 * Derived rather than authored per case, so a case that changes what it sends changes what this
 * screen promises with no copy edit — and read off the wave table rather than `definition.credits`,
 * because the strain a case credits is a fact about what clearing it *earns*, not about what walks
 * down its vessel. Every case in the season but one sends a strain it does not credit, so reading
 * `credits` here would quietly drop the help all of those strains are owed.
 *
 * A memory of zero sends nothing, which is the same read `noteRecognition` makes before it banks a
 * mark: no memory, no secondary response, and no separate rule saying so.
 */
function memoryResponseFor(
  definition: CaseDefinition,
  memory: Readonly<Record<StrainId, number>>,
): MemoryResponse | null {
  // The one read of the flag this screen makes. Off, nothing lands on any board, and a brief that
  // promised help anyway would be the one promise the build cannot keep.
  if (!ARRIVALS_ENABLED) return null;

  const remembered = new Set<StrainId>();
  for (const wave of definition.waves) {
    for (const entry of wave) {
      const strain = strainOf(memory, entry.kind);
      if (strain !== undefined && memory[strain] > 0) remembered.add(strain);
    }
  }
  if (remembered.size === 0) return null;

  // A roll of zero takes the killer branch whenever the mix permits one at all, so this asks
  // `arrivalKindFor` whether a killer is reachable rather than comparing to `IMMUNITY_MAX` a
  // second time — the gate that says only a held vaccine buys one lives there and nowhere else.
  const kinds = [...remembered].map((strain) => arrivalKindFor(memory[strain], 0));
  return kinds.includes('killer') ? 'killers' : 'marks';
}

/** The case brief: region, story, the rule, what's coming, how to stop it, the shield line. */
export function Brief({ definition, strainClears, memory, onStartCase, onBack }: BriefProps) {
  const totals = new Map<PathogenKind, number>();
  for (const wave of definition.waves) {
    for (const entry of wave) totals.set(entry.kind, (totals.get(entry.kind) ?? 0) + entry.count);
  }

  // The novel rule, and the whole of what it does: this screen exists to be read before a case,
  // and the finale's rule is that there is nothing to read. Hiding the list here rather than
  // emptying the wave table keeps the case a case — the simulation, the sweep and the result
  // sheet all see exactly what is coming; only the player does not.
  const unknown = caseHasRule(definition, 'novel');

  // Hidden on a novel case for the reason the wave table is: there is nothing to read before this
  // one, and what the body would answer with is read off the same table the rule hides.
  const response = unknown ? null : memoryResponseFor(definition, memory);

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

        {definition.rules.map((rule) => (
          <div key={rule.kind} className="rule-card" data-testid="brief-rule">
            <span className="rule-swatch" />
            <div>
              <span className="rule-name">{rule.label}</span>
              <span className="rule-sub">{rule.sub}</span>
            </div>
          </div>
        ))}

        <section>
          <span className="mono kicker">COMING THROUGH</span>
          {unknown
            ? (
              <p className="row-note" data-testid="brief-unknown">
                Nobody has fought this strain before, so there is nothing to list. You will find out
                what is in each wave when it arrives.
              </p>
            )
            : [...totals].map(([kind, count]) => (
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

        {response !== null && (
          <div className="memory-card" data-response={response} data-testid="brief-memory">
            {MEMORY_COPY[response]}
          </div>
        )}
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
