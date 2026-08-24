# Task 6 — Cancel Runtime Report

## Implemented semantics

- Added `cancelWorkflow(agent, workflowId, signal)` under the persistent cross-process workflow lease (`workflow-lock-<workflowId>`) and the in-process workflow lock.
- A finalized workflow rejects cancellation without changing its persisted state.
- The first cancellation persists `workflow.status = "cancelled"`, stops unfinished task records, active Owner records, and supervisor reservations as `stopped` with `reason = "decision_required"` and `action = "await_user"`.
- Repeated cancellation is idempotent: it does not rewrite the state or append a second cancellation log.
- Cancellation deliberately performs no Git/worktree/branch/outbox/log deletion. Existing cancelled-state guards prevent further owner execution, plan approval, and stage merging.

## Test coverage

`test/resilience.test.mjs` covers an active Owner plus running/pending tasks and launching/reserved supervisor reservations; dirty tracked, untracked, and ignored Owner files; workflow worktree preservation; repeated cancellation; persisted cancelled state; shutdown of owner/approval/merge paths; and rejection of finalized workflows.

## Verification

Executed from `owner-workflow-plugin`:

```text
node --test test/resilience.test.mjs
32 passed, 0 failed
```

No commit was created.
