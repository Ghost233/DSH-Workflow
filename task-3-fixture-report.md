# Task 3 resilience fixture report

## Read before migration

- Task 3 plan: `docs/superpowers/plans/2026-08-20-owner-workflow-v2.md`.
- Original command: `node --test test/resilience.test.mjs`.
- Original failures:
  - The stale-state CAS fixture called removed `runtime.addOwner` and failed with `TypeError: firstRuntime.addOwner is not a function`.
  - The `workflow_recover` fixture returned a plan whose `owner-a` was absent from the formal Owner Registry, so planning failed at the Registry gate.

## Fixture migration

- The CAS test now uses a real formal Registry: it registers the plan owners through Registry proposal/approval, retains a stale workflow snapshot, then lets a second runtime submit a legal `add` proposal. Replanning from the stale snapshot is rejected by `saveState` revision CAS, while the pending proposal remains intact.
- The recovery fixture formally registers the plan owners in each workflow worktree before its planner returns the plan. The plan owners therefore match the active Registry.
- No `runtime.addOwner`, direct owner write, production code, runner, or submodule was restored or changed.

## Verification

`node --test test/resilience.test.mjs` completed with 16 passing tests and 0 failures.
