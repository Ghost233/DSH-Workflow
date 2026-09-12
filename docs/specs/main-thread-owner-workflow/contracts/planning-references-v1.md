# Planning references v1

`DSH_PLANNING_REFERENCE_MANIFEST_V1` validates the selected Spec and Ticket
documents before a later consumer freezes them. It is a reference protocol only:
it does not authorize implementation, create a DAG, activate a Workflow, or
decide whether prose covers the requested behavior.

## API

`validatePlanningReferences({ root, cwd, manifest })` reads the selected files
and either throws `PlanningReferenceError` or returns:

```js
{
  contract: 'DSH_PLANNING_REFERENCE_SET_V1',
  spec: { id, revision, path, sha256, content, acceptanceCriteria, contracts },
  tickets: [{
    id, revision,
    document: { path, sha256, content },
    spec, acceptanceCriteria, contracts, dependsOn, work,
  }],
  ready: [{ ticketId, segment: { id } }],
  blocked: [{ ticketId, segment: { id, reason? }, blockedBy }],
}
```

The returned set is deeply frozen. `content` is the exact, valid UTF-8 source
whose SHA-256 was checked; a caller must not reread the same path and treat a
later edit as this result. T-07 owns any cross-file snapshot transaction and
must reread/compare within that transaction.

## Manifest and source declaration

The manifest has this shape. Its selected declarations are intentionally
duplicated in the source frontmatter, then compared exactly; the manifest's
`path` and `sha256` are the only locator fields that do not appear in the
source declaration.

```js
{
  contract: 'DSH_PLANNING_REFERENCE_MANIFEST_V1',
  spec: {
    path, id, revision, sha256,
    acceptanceCriteria: ['AC-01'],
    contracts: [{ id: 'C-01', revision: 'v1', status: 'ready' }],
  },
  tickets: [{
    path, id, revision, sha256,
    spec: { id, revision },
    acceptanceCriteria: [{ id: 'AC-01', specId: 'SPEC-01', specRevision: 'R1' }],
    contracts: [{ id: 'C-01', revision: 'v1' }],
    dependsOn: ['T-00'],
    work: {
      ready: [{ id: 'implementation' }],
      blocked: [{ id: 'external-follow-up', reason: 'awaiting service contract' }],
    },
  }],
}
```

Every selected Markdown file begins with this strict frontmatter grammar:

```text
---
planning_document: DSH_PLANNING_DOCUMENT_V1
document_kind: spec|ticket
document_id: stable-id
document_revision: stable-revision
planning_declaration: {"single":"line JSON object"}
---
```

Ticket frontmatter additionally contains `spec_id: stable-id` and
`spec_revision: stable-revision`. The declaration is one JSON line. A Spec
declaration contains exactly `id`, `revision`, `acceptanceCriteria`, and
`contracts`; a Ticket declaration contains exactly `id`, `revision`, `spec`,
`acceptanceCriteria`, `contracts`, `dependsOn`, and `work`. Contract `status`
may be omitted and then means `ready`; the only explicit values are `ready` and
`blocked`. The protocol does not parse Markdown body prose.

## Validation and scope result

- Paths first pass the existing `orchestratorDocumentPath` guard. Missing files,
  links, invalid UTF-8, guard-external paths, invalid frontmatter, identity
  disagreement, and SHA-256 mismatch fail.
- Stable IDs, paths, Ticket IDs, scope IDs, acceptance criteria, and contracts
  cannot be duplicated. A Ticket requires a revision, a nonempty AC set, and a
  nonempty `ready` plus `blocked` work set.
- Ticket `spec`, AC, and contract references must match the selected, versioned
  Spec declaration. Every dependency must select another Ticket; self edges and
  dependency cycles fail.
- A blocked contract moves that Ticket's ready scopes to `blocked`. A Ticket
  with a declared blocked scope may still return its own unrelated ready scopes,
  but it is incomplete, so each dependent Ticket is conservatively blocked.
  Independent ready work remains ready and all original blocked evidence is
  retained.
- A collection with no final ready scope fails with `NO_EXECUTABLE_WORK` and
  carries its derived blocked evidence on the error. It does not create an empty
  Workflow.

`PlanningReferenceError` always begins `Planning references:` and exposes a
stable `code` (`PLANNING_REFERENCES_<CODE>`) plus `field`. Codes include
`INVALID_MANIFEST`, `INVALID_SOURCE`, `UNSUPPORTED_PATH`, `MISSING_SOURCE`,
`MISSING_REVISION`, `HASH_MISMATCH`, `IDENTITY_MISMATCH`,
`DECLARATION_MISMATCH`, `DUPLICATE_ID`, `DUPLICATE_PATH`,
`REFERENCE_MISMATCH`, `MISSING_REFERENCE`, `DEPENDENCY_CYCLE`, `EMPTY_WORK`,
and `NO_EXECUTABLE_WORK`.

## Existing historical Spec

The R4 Spec currently under `docs/superpowers/` is a historical read source and
is outside the existing orchestrator document path guard. This protocol does
not widen the allowed directory. A future T-07 migration or explicit source
snapshot must establish an allowed planning document before it can enter a
validated set.
