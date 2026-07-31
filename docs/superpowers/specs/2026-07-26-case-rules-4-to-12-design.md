# Case rules 4–12 — content design

**Date:** 2026-07-26
**Status:** Shipped in full. All seven rules and all ten cases are playable; every section here is
now a record rather than a proposal, and the departures each shipped case made from its proposal are
noted under it. The season's remaining promise is the one in `later.ts` — a cleared region that
reopens, which Chickenpox's copy has described since before any of this landed.
**Depends on:** the shipped ruleset in `src/game/content/`, spec §5

---

## The premise: count rules, not maps

A new path with the same rule reads as a reskin within about two plays. What makes
the forearm feel unlike the throat is not geometry — it is that one bleeds you
until you clot and the other doubles every kill. Geometry varies the *execution*
of a plan; a rule changes what the plan **is**.

Four rules ship today — Dormancy landed with the hand case after this document was
written. This proposes the remaining three, giving seven, spread across ten cases
so each rule is met twice and the second meeting can assume the first.

Seven rules is also close to the ceiling. Every rule has to be explainable in one
line on the brief screen, and a player has to hold all of them in mind when
choosing a defender. Past seven they blur, and the game starts feeling like one
rule with cosmetic variation — which is the failure this document exists to avoid.

---

## The map already made a promise

The map screen counts **regions held** out of the non-core body nodes. There are
fifteen nodes; the heart is the core you defend rather than hold, so the counter
currently reads `0 / 14`.

Shipping three cases against a denominator of fourteen reads as an unfinished
game no matter how good those three are. Two honest resolutions:

**Recommended — make four nodes connective.** `shoulder`, `shoulderR`, `kneeL`
and `kneeR` read as joints, not sites of illness. Marking them as pass-through
(drawn, linked, never a case) leaves **ten case-bearing regions** and a counter
that reads `0 / 10`. Ten is reachable, fills the body visibly, and needs no new
art. The change is one flag in `body.ts` and one predicate in the map's count.

**Alternative — ship fourteen.** Every node gets a case. Truer to the diagram,
but it means four more cases carrying no new rule, which is exactly the reskin
problem above.

Changing the denominator to match a smaller shipped set is the last resort. A
body filling in region by region is the strongest progression hook the game has,
and shrinking it to flatter the content spends that hook to save authoring time.

---

## The four shipped rules

Restated because the new ones are defined against them.

| Rule | Region | What it changes |
|---|---|---|
| **Bleeding** | Forearm | Energy drains every second until a clot exists. Forces an opening purchase that does no damage. |
| **Multiplying** | Throat | Every virus killed splits in two. Punishes killing in the wrong order and rewards suppressing the split at source. |
| **Toxic** | Stomach | Pathogens damage defenders. Antibodies resist far better than phagocytes. Makes position a liability, not just a choice. |
| **Relapsing** | Hand | A share of what dies goes back down and gets up again where it fell. Shipped as day 7; §6 below is the design it shipped from. |

Each one attacks a different assumption: that energy only goes up, that killing is
always good, that a placed cell stays placed, and that progress only runs one way.

---

## Four rules, of which one has since shipped

### 4. Overreaction — the allergy rule — SHIPPED

**The threat is harmless. Your response is the problem.**

Pollen carries almost no damage and does not target the core. But every kill
inflames the tissue, and inflammation costs you. Clear the board aggressively and
you lose the region to your own defence.

The player must *under-defend on purpose* — hold fire, let harmless things pass,
and intervene only where it matters. It inverts the core loop more completely
than anything else here, which is the strongest argument for it and the reason to
be careful where it lands.

The asset sheet asks whether Allergy is "too clever for the first hour, or the
thing people tell their friends about." Both, probably — so put it at case six or
later, once killing-is-good is a habit worth breaking. It is the rule most likely
to be remembered and the one most likely to confuse if met early.

*Fiction:* hay fever in the sinus, asthma in a lung. Real, everyday, tier 1.

**Shipped** as the last case of the current season: `sinus` on the `sinus` node, rule `allergy`,
governed by `INFLAMMATION_PER_PIP` in `rules.ts` and a new `pollen` pathogen.

One thing the proposal above got wrong, and it cost a measured pass. "Pollen carries almost no
damage" was written as *flimsy*, and flimsy pollen makes the rule degenerate. Defenders pick a
target by position or by wound, never by kind, so what a board kills is roughly what a board meets
— which collapses the case to `pips = leaks + kills / threshold`, both terms linear in one dial,
with the best play always at an end. Measured, that was **0 of 7776 boards**.

Pollen therefore ships *tough* — heavier than a spore. Damage lands on it in proportion to how
often it is the target, but kills divide that by health, so a stream that is nine parts pollen
still yields more staph deaths per unit of firepower than pollen deaths. "Enough firepower to clear
the real threat and no more" becomes the interior optimum, which is what the rule needed and what
the first tuning had no way to express. The fiction is better for it: pollen is not fragile, it is
inert, and your cells wear themselves out on something that was never going to hurt you.

The proposal's open question — whether the rule needs a defender that suppresses rather than kills
— stayed open and stayed unbuilt. It is not needed for the rule to work: the decision the case asks
is which cells and how many, and the answer it rewards is few and single-target. A suppressor would
make it a cleaner puzzle and a smaller one.

### 5. Amnesia — the immune-wipe rule — SHIPPED

**One immunity you earned does not work here.**

Measles is already promised on the season screen with exactly this note. The
brief names which vaccine is suppressed; the case plays as though it were never
earned. If Tetanus is the one wiped, the first staph of every wave stops bouncing
and the opening you have used five times stops working.

This is the rule that punishes a narrow build. It only lands if the player *has*
immunities, so it must sit after at least two are earned — hence its promised day.
Its counter, the MMR vaccine, already exists in `vaccines.ts` gated on two clears
and costs a day not spent fighting: the first real strategic trade in the season.

*Fiction:* Measles, whole body. Tier 2 — named because immune amnesia is genuinely
what it does, per the naming policy.

**Shipped**, and two things about it were decided rather than followed.

**There is no whole-body node, and this table is one region short of its own ten cases.** Count
them: nine of the ten rows name a body node and one names "whole body", against ten case-bearing
regions — so either measles takes the leftover second foot, or the table doubles up. A systemic
illness lighting up a foot on the map is nonsense, so measles ships on **`lungR`**: measles
pneumonia is what actually endangers the body, and anchoring it there costs the map nothing. It
takes the region this table had pencilled for the finale, because an invented strain is the one
case in the season with no tie to any organ and is therefore the cheapest thing to move. What is in
its waves is *not* measles — it is the opportunists that walk in behind the wipe, which is what
immune amnesia does in life.

**The rule has to bite on a first run, and that constrains what earlier cases credit.** A wipe of
an immunity the player has not earned does nothing, and a strain needs three clears. Stomach and
hand credit film; the blister case was therefore given film as its third, so film reads DONE one
case before measles takes it away. Crediting staph there instead — the obvious choice for a wound —
would have left every immunity under three at that point and the rule inert on every first
playthrough. `content.invariants.test.ts` now asserts the ordering, so moving the amnesia case
earlier, or re-crediting a case, fails rather than quietly emptying the rule.

The MMR row on the season screen still says it blocks the wipe, and still cannot be taken: nothing
in the game buys a vaccine. That promise is older than this rule and is now less broken than it was
— it used to describe a rule that did not exist — but it is not kept.

### 6. Dormancy — the relapse rule — SHIPPED

**Clearing it is not the end of it.**

Something survives. Within the case, a fraction of what dies reawakens once after
a delay, at reduced health, from where it fell rather than from the entry. The
board you cleared is not the board you have.

It attacks the assumption that progress is monotonic, and it makes the memory cell
— which grows from kills near it — genuinely the right answer somewhere, rather
than a late-unlock curiosity.

Chickenpox already exists in `vaccines.ts` as "stops a cleared case reopening
later". It shipped with an unreachable `gate: 99` and is now marked `later: true`
instead — on the schedule rather than behind a gate nobody can satisfy — because
this rule governs relapse *within* a case and the vaccine's promise is about a
case reopening between days, which nothing yet does.

*Fiction:* a splinter in the hand that festers; shingles from a chickenpox that
never left. Tier 2.

**Shipped** as day 7: `hand` on the `handR` node, rule `dormant`, tuned in
`cases.ts` and governed by `DORMANT_CHANCE`, `DORMANT_DELAY` and
`DORMANT_HP_FRACTION` in `rules.ts`. It credits film rather than staph — see the
note in `vaccines.ts` on why the Tetanus copy now says "in a wound".

### 7. Novel — the unknown-strain rule

**Nothing is known about it yet.**

Strain Vesper is promised for the finale. The brief cannot list what is coming,
because nobody has seen it. Wave composition is hidden until first contact and
each wave reveals only what it sends.

Every other case is solved before it is played — read the brief, pick a build,
execute. This one is solved *while* playing, which is why it belongs last and
nowhere else. It needs no new pathogen behaviour: unfamiliar combinations of the
six that exist are enough when the player cannot plan for them.

No vaccine exists, and `vaccines.ts` already says so. The one case fought raw.

*Fiction:* invented strain, tier 3 — never a real outbreak, per the naming policy.

**Shipped** as day 10: `vesper` on the `footR` node, rule `novel`. Two things about it departed
from this section, both deliberately:

- **It did need a new pathogen after all.** "Unfamiliar combinations of the six that exist" is a
  claim about the *player's* knowledge, and the player is told what everything does on the brief of
  the case that introduced it — so a wave of familiar bodies in an unfamiliar order is a case they
  can still solve on sight, and hiding the list only costs them one read. `vesper` in
  `pathogens.ts` is the thing the hiding is *for*: untaggable and self-healing, so the antibody —
  the cell that reaches, and therefore the cell every board in the season is built around —
  contributes nothing to it at all.
- **The rule changes no simulation behaviour.** `novel` is the only member of `CaseRuleKind` that
  no hazard branches on: what it does is stop `Brief` rendering the wave table. The simulation, the
  sweep and the result sheet all see exactly what is coming; only the player does not. Tested where
  it lives, in `Brief.test.tsx`, because a test that read the simulation would prove nothing.

---

## Ten cases

Seven have shipped, in this order. Days are the day of a fresh run, so they are the play order and
not the numbers this table originally carried — the hand case landed ahead of days 4 to 6, and the
three after it were authored around it. Relative order is what the rationale below is about, and
that is intact.

| Day | Region | Case | Rule | What the player learns | |
|---|---|---|---|---|---|
| 1 | Forearm | Deep cut | Bleeding | Energy can fall. Buy the thing that does no damage. | **Shipped** |
| 2 | Throat | Flu | Multiplying | Killing has an order. | **Shipped** |
| 3 | Stomach | Food poisoning | Toxic | Your cells die too. Position is a liability. | **Shipped** |
| 4 | Hand | Splinter | Dormancy | Cleared is not clear. Memory cells earn their place. | **Shipped** |
| 5 | Foot | Blister | Bleeding | The rule again, with less room and a longer path. | **Shipped** |
| 6 | Right lung | Measles | Amnesia | Breadth beats depth. A narrow build stops working. | **Shipped** |
| 7 | Sinus | Hay fever | Overreaction | Sometimes do less. | **Shipped** |
| 8 | Left lung | Bronchitis | Multiplying | Splitting with less room to do it in. | **Shipped** |
| 9 | Gut | Relapse | Dormancy + Toxic | Two rules at once — the first compound case. | **Shipped** |
| 10 | Right foot | Strain Vesper | Novel | Everything, unannounced, and one thing nothing binds to. | **Shipped** |

There is one hand node, `handR`, and day 4 has taken it. Of the two foot nodes, day 5 takes one and
the other is where Vesper now goes — the right lung it was pencilled for went to measles, for the
reason recorded in §5, and an invented strain is the case with the least to lose by moving.

**Ordering rationale.** Each rule is met alone before it is combined. The bleeding repeat sits on
harder geometry so the rule is understood before the next case takes a tool away. Overreaction
lands last of the seven, after six cases of killing-is-good. The compound case is deliberately one
before the finale, so the finale is not the first time two questions are asked at once.

**Every strain finishes.** Staph is credited by forearm, sinus and relapse; virus by throat, measles
and bronchitis; film by stomach, hand and blister — three each, which is `IMMUNITY_MAX`. So a season
played through fills the immunity screen exactly once, and the finale is played holding all three
vaccines against a strain none of them touch. That is the reason the last three cases credit what
they credit, and `content.invariants.test.ts` now asserts it rather than leaving it to arithmetic
somebody did once.

**What the ten measure**, buying and never growing, over every affordable board:
13.2 / 6.3 / 5.5 / 5.3 / 7.2 / 7.2 / 6.3 / 5.2 / 5.4 / 6.2 per cent of boards clearing.

**The three new boards are shaped against `2026-07-31-season-shape-review.md`**, which measured what
the first seven had in common: one entry edge, one exit edge, one flow direction and one spot
offset, in all seven. Bronchitis enters through the roof and runs down a column; Relapse enters from
the right and coils; Vesper enters through the floor and climbs. The review also records the two
things that tuning them taught — that spot offset is worth ten times what a wave count is, and that
on a poison case it has an interior optimum with a cliff on both sides.

---

## The compound case needed a shape change, not a rule

A case used to carry one `CaseRuleKind` and one label and one sentence. Day 9 carries two of each,
so `CaseDefinition.rules` is now a non-empty list of `{ kind, label, sub }` and `SimState.rules` is
the list of kinds, read through `hasRule`.

The alternative — a `dormantPoison` member of `CaseRuleKind` — was rejected because every hazard
that already branches on one of the two would have grown a second branch meaning the same thing, and
the third compound case would have needed a fourth. It also puts the copy beside the rule it
describes, so a compound case cannot show one card and play two rules.

Both halves are asserted through the hazards themselves in `hazards.test.ts`, against the mutation
the change is actually exposed to: a `rules` list read as `rules[0]` anywhere in the chain, which
would leave the case playing whichever rule is written first and silently dropping the other.

## What this needs in code

The rule mechanism is already data-driven — `CaseRuleKind` is a union and
`hazards.ts` switches on it exhaustively. Each new rule is:

- one member of `CaseRuleKind`
- one branch in the hazard system, with tests
- content: path, five build spots, five wave tables, brief copy

The existing invariants carry over unchanged and will catch the usual authoring
mistakes: every spot must offer a choice of at least two defenders, every case
must credit a strain that has a vaccine, every wave must reference pathogens that
exist, every path needs at least two points.

**Overreaction needed one genuinely new thing:** a cost applied on kill rather
than on leak. Built as `applyInflammation`, called from `resolveDeaths` under the
same leak guard as splitting — so something that walked past everything costs
nothing, which is the half that makes the rule an inversion. It needed a second
thing this section did not foresee: a *leak* cost that is the pathogen's rather
than a constant (`PathogenStats.leak`), because a rule about over-defending is
unplayable if the harmless thing still costs a pip on the way out.

**Amnesia needed a suppression channel** — the case must be able to mask an earned
immunity for its duration. `SimState` already carries `immunity` as readonly
profile data; this became a per-case mask applied when the state is built, which
keeps the profile itself untouched. Masking at the boundary rather than at each of
the three places an immunity is read means the fourth one somebody adds is wiped
too, without knowing the rule exists.

**Dormancy needed a revival queue** — dead enemies scheduled to return once. Built
and shipped; it did not reuse `generation` as this section guessed it would.

---

## Open questions, unresolved

Carried from the asset sheet, plus one this document raises.

- Should a lost region stay lost for the whole run, or heal after two days? The
  map is built to show it either way; nothing in the code decides yet.
- Does the heart ever get attacked directly, or is it only ever the thing being
  protected? A systemic case at day 10 is the obvious place to answer yes.
- Six defenders is a full dock on a phone. Is a seventh a replacement rather than
  an addition? Maturation may have already answered this: three of the six now
  have a second form, which adds depth without adding a slot.
- **Answered no, for now:** does Overreaction need its own defender? The rule
  shipped without one and is playable: the decision it asks is which cells and how
  many, and the answer it rewards is few and single-target. A cell that suppresses
  rather than kills would make it a cleaner puzzle and a smaller one, so it is a
  design choice rather than a gap. The seventh-slot question stays open on its own
  terms.
- **New:** nothing in the game buys a vaccine. MMR has read AVAILABLE since two
  clears, promising to block the amnesia wipe, and there is no purchase, no day to
  spend and no effect wired to it. That predates the rule and is now the only
  vaccine row describing something the player could act on if the screen let them.
