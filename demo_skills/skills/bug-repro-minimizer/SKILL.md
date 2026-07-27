---
name: bug-repro-minimizer
description: >-
  Reduce a failing test case, script, or input file to the smallest version
  that still reproduces a bug. Use when the user has a large reproduction and
  asks to minimize, bisect, or isolate it, or says things like "it stops
  failing when I remove half the file". Do not use when there is no reliable
  reproduction yet - help build one first, then minimize it.
---

# Bug Repro Minimizer

Shrink the reproduction until every remaining line is load-bearing. The
deliverable is a minimal case *plus proof* that each removed part was
irrelevant.

## Prerequisite: a reliable oracle

Before cutting anything, define a command that exits 0 for "bug gone" and
non-zero for "bug present" — and run it 3 times on the untouched reproduction.
If results vary, the bug is flaky; stop and stabilize the oracle first
(fixed seed, pinned versions, retries) or minimization will chase noise.

## Reduction loop

1. **Cut coarse to fine.** Remove the biggest independent chunk first: a whole
   file, a function, a config section. Halve, don't nibble — deleting one line
   at a time on a 2,000-line repro wastes hundreds of runs.
2. **Run the oracle after every single cut.** Bug still present → keep the
   cut. Bug gone → restore the chunk, split it in half, try each half.
3. **Then simplify values.** Once no structure can be removed: shrink strings
   to `"x"`, numbers to `0`/`1`, arrays to one element — reverting any change
   the oracle rejects.
4. **Stop when stuck.** When every remaining element has been tried and each
   one is required, the case is minimal.

## Verify the result

- Run the oracle 3 times on the final case — still failing every time.
- Restore any *one* removed piece at random and confirm the case still fails
  (guards against accidentally minimizing into a *different* bug — compare
  the error message/stack, not just the exit code).

## Example

```text
start:  1,842-line SQL dump, importer crashes
cut 1:  drop bottom half            → still crashes (keep)
cut 2:  drop remaining top half     → passes (restore, split)
...
final:  3 lines - a CREATE TABLE and one INSERT with a NUL byte in a varchar
```

The final report: the 3-line case, the oracle command, and the observation
that the NUL byte is the trigger — which is the actual bug report.

## Rules

- Never minimize on the user's only copy; work on a duplicate.
- Log every cut and its oracle result; the log is the proof of minimality.
- If two different errors appear during reduction, fork: minimize each
  separately rather than blending them.
