# Case rules 4–12 — content design

**Date:** 2026-07-26
**Status:** Proposal. Day 7 has since shipped — the hand case, carrying Dormancy — so the
sections describing that rule are records rather than proposals and say so.
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

### 4. Overreaction — the allergy rule

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

### 5. Amnesia — the immune-wipe rule

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

---

## Ten cases

| Day | Region | Case | Rule | What the player learns |
|---|---|---|---|---|
| 1 | Forearm | Deep cut | Bleeding | Energy can fall. Buy the thing that does no damage. |
| 2 | Throat | Flu | Multiplying | Killing has an order. |
| 3 | Stomach | Food poisoning | Toxic | Your cells die too. Position is a liability. |
| 4 | Foot | Blister | Bleeding | The rule again, with less room and a longer path. |
| 5 | Whole body | Measles | Amnesia | Breadth beats depth. MMR becomes worth a day. |
| 6 | Sinus | Hay fever | Overreaction | Sometimes do less. |
| 7 | Hand | Splinter | Dormancy | Cleared is not clear. Memory cells earn their place. **Shipped.** |
| 8 | Left lung | Bronchitis | Multiplying | Splitting under a real time limit. |
| 9 | Gut | Relapse | Dormancy + Toxic | Two rules at once — the first compound case. |
| 10 | Right lung | Strain Vesper | Novel | Everything, unannounced. |

There is one hand node, `handR`, and day 7 has taken it — so the right hand is
spoken for, not open. Of the two foot nodes, day 4 takes one and the other stays
open for a second season, or becomes connective.

**Ordering rationale.** Each rule is met alone before it is combined. Day 4
repeats bleeding on harder geometry so the rule is understood before day 5 takes
a tool away. Overreaction lands at six, after five cases of killing-is-good.
Day 9 is the first case that asks two questions at once, and it is deliberately
one before the finale so the finale is not the first time.

---

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

**Overreaction needs one genuinely new thing:** a cost applied on kill rather than
on leak. Everything else reuses machinery that exists.

**Amnesia needs a suppression channel** — the case must be able to mask an earned
immunity for its duration. `SimState` already carries `immunity` as readonly
profile data; this becomes a per-case mask applied when the state is built, which
keeps the profile itself untouched.

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
- **New:** does Overreaction need its own defender? A cell that suppresses rather
  than kills would make the rule playable rather than merely survivable. That may
  be the seventh dock slot, and the argument for a replacement rather than an
  addition.
