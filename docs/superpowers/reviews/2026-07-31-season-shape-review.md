# Why the levels all look the same — a measured answer

**Date:** 2026-07-31
**Under review:** the seven cases shipped as days 1–7, at `cb17fd4`
**Method:** measured every case's path, build spots, wave table and unlock schedule off the shipped
content modules. Every number below is computed from `src/game/content/`, not estimated.
**Status of the fix: all of it has landed.** Days 8–10 were authored against this review; days 1–7
were then re-shaped and the dock was turned into a schedule. §1–§4 describe the season as it was;
§5 is what was done about it and §6 is what doing it cost.

---

## 0. The verdict in one paragraph

The cases are not similar by accident and they are not similar because of the art. They are similar
because **four measurable things are held nearly constant across all seven**, and every one of them
is a thing the balance harness cannot see. The vessel enters from the same edge and leaves by the
same edge in every case; the flow runs down-and-right in every case; the build spots sit at the same
distance from the vessel in every case; and the dock stops growing after case two while the wave
tables draw from the same four pathogens from case three onward. What varies is the rule line and
the numbers. That is one board, played ten times, with a different sentence at the top.

---

## 1. The blood flow is one shape, seven times

| Case | Enters | Leaves | Length | Down | Up |
|---|---|---|---|---|---|
| forearm | `[-24, 46]` — left | `[104, 430]` — floor | 641u | 48% | 0% |
| throat | `[-24, 120]` — left | `[104, 430]` — floor | 740u | 41% | 7% |
| stomach | `[-24, 70]` — left | `[180, 430]` — floor | 766u | 40% | 3% |
| hand | `[-24, 74]` — left | `[214, 430]` — floor | 777u | 39% | 4% |
| blister | `[-24, 58]` — left | `[176, 430]` — floor | 983u | 34% | 4% |
| measles | `[-24, 96]` — left | `[168, 430]` — floor | 803u | 37% | 5% |
| sinus | `[-24, 150]` — left | `[252, 430]` — floor | 968u | 32% | 9% |

**Every case enters at `x = -24`.** Not "on the left" — at the same x, in the upper third, and
leaves through the floor. Rightward travel is 33–40% of path length in all seven; downward is
32–48%; upward never exceeds 9%.

So the player's first read of every board is identical: *it comes in top-left, it goes out the
bottom, I defend the middle*. The forearm, the sinus and the sole of a foot are drawn in wildly
different places on the body map and then play on the same diagram. Nothing ever arrives from
behind, climbs, forks, or doubles back through a place already defended.

The variation that does exist — 641u to 983u of length, a few more or fewer kinks — is the
variation a player cannot name. Two cases differing by 300 units of vessel still read as "the
zigzag one" and "the other zigzag one".

## 2. The build spots are laid to one tolerance

Every case has exactly five spots, and their mean distance from the vessel is:

| measles | forearm | blister | sinus | stomach | hand | throat |
|---|---|---|---|---|---|---|
| 52.7u | 58.4u | 58.5u | 59.9u | 61.9u | 63.6u | 64.7u |

Twelve units of spread across the whole season, against a defender range band — 72 (mast) to 94
(anti) — that is twenty-two units wide. Every spot in the game is placed just inside the reach of
most of the dock, so the placement question is the same question every time: *this one is close
enough for a phagocyte, that one is antibody-only*.

The consequence shows up in coverage. Sharing the whole vessel between five spots of one kind:

| Case | phago (74) | mast (72) | anti (94) |
|---|---|---|---|
| forearm | 62% | 57% | 89% |
| throat | 44% | 42% | 81% |
| stomach | 42% | 37% | 76% |
| hand | 50% | 44% | 87% |
| blister | 36% | 29% | 82% |
| measles | 52% | 47% | 88% |
| sinus | 35% | 31% | 70% |

The ordering is identical in all seven, and the antibody — the longest reach in the dock — holds
70–89% of the vessel everywhere. That is why every measured best-board in the repository has
antibodies in it. **Reach decides, and reach decides the same way on every board**, so the boards
do not ask different questions.

## 3. Nothing new arrives after case three

Two tables, and neither is about difficulty.

**The dock stops growing in case two.**

| Case | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Cells gained | phago, clot, anti, nk, mast | mem | — | — | — | — | — |

Five of six cells are available on day one and the sixth on day two. Cases three through seven add
nothing to the dock at all. The only depth after that is maturation, and both forms it offers are
available from case one too.

**The threat table stops growing in case three.**

| Case | New pathogens |
|---|---|
| forearm | staph, film, mrsa |
| throat | virus, spore |
| stomach | toxin |
| hand | — |
| blister | — |
| measles | — |
| sinus | pollen |

Days 4, 5 and 6 send **nothing the player has not already fought**. They are the same four bodies —
staph, biofilm, spore, resistant — in different proportions, over five waves that escalate from
8–13 bodies to 24–38 in every case in the season.

So from case four onward, a new case brings: a rule line, a wave table with different numbers, and
a path the player cannot tell from the last one. The rule is doing all of the work, and one sentence
per case is not enough novelty to carry eight cases.

## 4. Why it happened, which is the part worth keeping

Every one of the four constants above is invisible to the instruments this project actually runs.

- `content.invariants.test.ts` asks whether a spot is *usable* — at least two cells hold a second of
  vessel from it. Ten identical boards pass.
- `balance.sweep.ts` asks what share of affordable boards clear, and `curve.ts` asks whether that
  share falls across the season. Ten identical boards pass both.
- The spot-coverage report added after the measles tuning prints seconds of vessel per spot. It
  would show ten identical rows and read as consistency.

The harness measures **how hard** a case is, and nothing measures **what it is like**. Worse, the
tuning loop actively converges on sameness: the documented levers are wave counts, starting energy
and pulling spots toward the vessel, so every authoring pass moves a case *toward* the coverage
band that the previous cases already sit in. The one place geometry entered the record — measles,
where pulling three spots in was worth +3.5 points against a count lever's +0.3 — taught the lesson
"spots must be close enough", not "spots must be somewhere different".

Twelve tuning passes were spent on days 5 to 7. Not one of them could have surfaced this, and the
defect reached a person instead of a test.

## 5. What has been done about it, and what has not

**Done — the measurement exists now.** `balance.sweep.ts` prints a `SEASON SHAPE` block beside the
coverage report: entry edge, exit edge, path length, a signed flow number, mean spot offset, and the
pathogens each case introduces that no earlier case did. It reports and never gates, for the same
reason the coverage report does — geometry is an author's judgement.

**Done — the weakest useful part is gated.** `content.invariants.test.ts` now asserts that the
season does not enter every board from the same edge, and that every vessel starts and ends off the
board. The first of those would have failed on the shipped seven. It is deliberately a low bar: a
gate that specified geometry would be authoring by assertion.

**Done — days 8, 9 and 10 are authored against this review.** Bronchitis enters through the roof and
runs down a narrow column with the spots on its flanks; Relapse enters from the right and coils, so
the best spot on the board is also the one the poison rule kills you on; Strain Vesper enters
through the floor and **climbs**, the only case in the season whose flow is against the grain of
every other. Each brings something new besides its rule — a second splitter, a compound of two
rules, and an untaggable strain that makes the season's dominant cell useless.

**Done — days 1 to 7 were re-shaped, and the technique is the part worth keeping.** Every one of the
seven has a new path and five new spots. No two of the ten cases now share an entry-and-exit pair:

| | forearm | throat | stomach | hand | blister | measles | sinus | bronchitis | relapse | vesper |
|---|---|---|---|---|---|---|---|---|---|---|
| in | left | top | top | right | bottom | top | left | top | right | bottom |
| out | right | left | top | bottom | bottom | right | top | bottom | left | top |

A limb the vessel crosses; an airway coming down from the head; a sac that goes in and comes back
out the way it came; a splinter track folded twice; a closed pocket under a blister; a column; a
coil; a climb.

**The re-tune was affordable because the spots were placed by matching, not by eye.** Clear rate
tracks a board's *dwell profile* — the seconds of vessel each spot covers, per cell — far more than
it tracks the shape of the path. So each new board's five spots were chosen by grid search against
the old board's profile, cell by cell across all six ranges. Two cases came across needing nothing
at all. The one thing that does not survive the matching is **redundancy**: two spots covering the
same stretch have the same summed dwell and much less union coverage, which is what moved blister
by three points before its spots were re-picked against the full six-range profile rather than the
phagocyte's alone.

**Done — the dock is a schedule.** Five cells on day one was what left eight cases with nothing to
unlock. It is now three on day 1 and one each on days 2, 3 and 4, with the two matured forms on
days 5 and 7 (`defenders.ts` carries the reasoning). Every day of the season now adds a cell, a
form, a rule or a strain; before this, six of the ten added a rule and nothing else.

**Not done — nothing.** The one thing this review recommended and did not get is a case whose path
crosses itself; the gut's coil comes closest.

---

## 6. What this review's own numbers cost

Recorded because the next author will retune something.

**Spot offset is the strongest lever in the game, and it is not monotonic.** On the compound case,
moving five spots ~10 units *out* took the clear rate from 15.8% to 4.4% with nothing else changed —
eleven points, against the 0.3–0.8 points a body in a wave table is worth. But moving them a further
10 units *in* took it to **0.0%**, because the poison rule charges per body within 42 units: past
that radius a spot buys coverage, inside it a spot buys a dead cell. Any case carrying `poison` has
an interior optimum for spot distance, and both sides of it are cliffs.

**Cutting mass from an early wave usually makes a case harder, not easier.** Softening bronchitis's
wave 1 moved it 4.5% → 3.9%; softening relapse's moved it 4.4% → 4.1%. Bodies are income, and a
board that meets a smaller wave 1 arrives at wave 2 with less energy and fewer cells. Late waves are
where mass is a cost rather than a wage — the forearm and hand tunings found the same thing from the
other direction.

**A wave table and an unlock schedule are one schedule, and splitting them costs more than any
tuning.** Gating the killer cell to day 2 and the macrophage to day 5 left the opening case sending
three Resistant strains at a dock that had no answer to one: `mrsa` carries 60 per cent armour and
cannot be tagged, so a phagocyte does it six damage a second against 150 health. Forearm measured
**2.1%** of boards clearing. Taking the three Resistants off day one, with nothing else changed,
measured **14.0%** — nearly seven times, and far more than every other lever on that case put
together. Before tuning a case that reads as impossible, check that everything it sends has an
answer the player has already been handed.

**Coverage is not the only thing spot distance buys on a poison case — it is also what the poison
costs.** The stomach's whole identity is that position is a liability, and the retrofit briefly
deleted it: the new spots were all more than 42 units off the vessel, which is `POISON_RADIUS`, so
no cell was ever damaged and the case jumped to 14.6%. It came back to 7.4% on spot distance alone.
A poison case has two thresholds, not one — far enough to survive, close enough to fight — and a
board that satisfies only the first is a different case wearing the same rule.
