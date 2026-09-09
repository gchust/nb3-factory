# Browser acceptance and recovery

The application build and browser QA have different repair owners:

- Exit `0`: the report and its required evidence passed. Independent final
  verification must still pass before a PR can be published.
- Exit `2`: the report or its evidence is incomplete. The same QA session
  receives the validator diagnostic and can repeat the observation or attach
  existing evidence. The application and database stay running.
- Exit `10`: an observed business failure. Application repair receives the
  failure, then the factory verifies again against a fresh database.
- Exit `75`: the runner budget was reached; save the checkpoint and continue.
- Other nonzero exits: infrastructure failure; retain diagnostics and the
  checkpoint, mark the Issue failed, and require a deliberate retry.

Issue #32 exposed a delivery criterion containing “edit” whose report omitted
the prefill observation already present in its dedicated edit check. Missing
evidence must not be rewritten into an application defect. QA must associate
the actual observation and screenshot with that delivery check before passing.
Explicit empty required fields or a required flow showing “Something went wrong”
remain business failures.

QA invocations load the trusted `qa-process-guard.mjs` Pi extension. It blocks
process termination commands before the bash tool runs, avoiding accidental
matches against the supervisor's prompt and log paths. Use `agent-browser close`
and `open` in the existing isolated session, then authenticate and snapshot
again. This guard prevents accidental commands; it is not an OS sandbox for
arbitrary code.

After an implementation or verification failure, the factory still packages
the application diff and uploads `factory-handoff-<issue>`, provided patch
creation succeeds. Protected paths are removed using the same patch policy.
The failed job stays failed and neither final verification nor PR publication
can run. Failed checkpoints do not automatically dispatch another run.

To recover, fix the control plane first and dispatch `code-agent-continue` with
the Issue number and the run containing the saved checkpoint, through
`handoff.mjs dispatch --issue <issue> --previous-run-id <run> --continuation <n>`.
The helper requires `GITHUB_TOKEN` and `GITHUB_REPOSITORY`. Artifacts expire after
14 days. Ordinary `workflow_dispatch` does not restore a checkpoint. A re-run of
an existing continuation restores that event's original source checkpoint.

Regression checks: `pnpm factory:test`. The Issue-driven integration test must
start after the fix is on the default branch, since factory jobs deliberately
check out their control plane from that branch.
