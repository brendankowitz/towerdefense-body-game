# Pathogen research and the immune response

**Date:** 2026-07-26
**Status:** Proposal, not approved
**Sequence:** after cases 4–10 (`2026-07-26-case-rules-4-to-12-design.md`)
**Depends on:** the balance sweep being able to model units it did not buy

---

## The problem it solves

Exposure already earns something permanent. Clearing a strain three times earns its vaccine,
and the vaccine is real — the first Staph of every wave bounces off, flu stops splitting,
biofilm armour drops.

Every one of those is an **invisible rule change**. The player reads about it on a screen they
have left, then plays a case that is quietly easier without ever seeing why. The game's only
permanent progression is the one thing it never shows.

This puts it on the board.

---

## The core idea: specificity

An antibody response is strain-specific. A tetanus response does nothing to flu.

That is true to the biology and it is the most interesting thing here mechanically, because it
stops immunity being a flat power curve and makes it a **matchup**. A wave of Staph in a region
you have fought Staph in three times is genuinely easier. The same wave with Biofilm mixed in is
not. Breadth beats depth, and the player feels which strains they have neglected.

It also gives the Amnesia rule its teeth. Measles wiping an earned immunity is a line of text
today; it is a visible loss once immunity is something you can watch working.

---

## Shape

**Reinforcements arrive free and take no build spot.**

Build spots are the game's central scarcity — five junctions, and the reach preview exists
because choosing badly among them is the core decision. Immunity is the one thing that should
let a player *bypass* that scarcity rather than merely improve within it. That is what makes it
feel like a different kind of reward from energy.

- **Weak individually.** A response is not a defender; it is help.
- **Strain-specific.** A response earned against Staph engages Staph and nothing else.
- **Scaled by exposure.** Roughly one per wave at one clear, a steady trickle at three.
- **They expire.** A response, not a permanent garrison. The body reacts and settles.

Naming: **memory response**. Not "mini phagocytes" — what circulates after exposure is
antibodies, and Tag is already the antibody cell. "Memory response" also draws a clean line
against the Learn cell: **Learn improves within a case; the memory response is what the body
brings between runs.**

---

## Immunisation, without breaking a stated rule

The season screen says, in the design's own words: **EARNED, NEVER BOUGHT.**

Buying immunity with energy would break that, and the rule is worth keeping — it is what makes
a vaccine feel like something the body achieved rather than something the player shopped for.

The reconciliation already exists in content. The MMR entry costs *"a day you don't fight"*.
**Immunisation costs time, not currency.** A day on the needle is a day the infection advances
somewhere else, which is a real cost and an interesting one, and it leaves the rule intact.

---

## What this touches

| Area | Effect |
|---|---|
| `content/vaccines.ts` | Vaccines gain a response tier alongside their passive effect |
| The simulation | A spawner for free, expiring, strain-filtered units |
| The renderer | They must read as help arriving, not as another defender |
| The map | The immunity display becomes a readout of what you are carrying, not just progress toward a rule |
| Amnesia (case rule 5) | Becomes a visible loss rather than a line of text |

---

## The balance risk, stated plainly

**Free units that bypass the build-spot limit are strong.** They are also currently invisible to
the only instrument that can measure them: the sweep plays every affordable *board*, and a
memory response is not on the board.

The sweep is already being taught to model maturation for exactly this reason — its claim that
the reported clear rate is a floor rests on an argument rather than a measurement. Adding a
second unpriced mechanic on top of that would leave two things the harness cannot see.

**Do not tune this by feel.** The sweep must model the response before any of its numbers are
chosen, or every clear rate in the project becomes a number about a game nobody plays.

---

## Open questions

- Does a response spawn at the vessel entry and walk, or appear where it is needed? Walking is
  more legible and slower; appearing is stronger and reads as magic.
- Does it help against a *similar* strain, or only the same one? Cross-reactivity is real
  immunology and would soften the matchup, which may be a mercy or may blunt the whole idea.
- Does a maxed strain still earn anything from being fought again, or does the case become a
  formality? Diminishing returns are honest; a case with nothing left to give is dead content.
- Should a response be visible on the brief, so the player can plan around what they carry?
