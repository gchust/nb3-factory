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

QA's per-check `status` is the verdict. The validator checks the report's
structure, criterion coverage, screenshots and recorded browser commands, and
derives the overall result from the checks, but it never reinterprets the prose
in `actions` or `evidence`. An earlier regex guard read negated observations such
as “未出现 Something went wrong” as defects and spent whole repair rounds
(#110, #112). The QA prompt owns the business rules instead: a required flow
showing “Something went wrong”, or an edit form that loses existing values, must
be recorded as `failed` by QA itself.

Pi and CodeBuddy QA invocations load the same trusted guard: `qa-process-guard.mjs`
as a Pi extension, or `codebuddy-qa-guard.mjs` as a CodeBuddy `PreToolUse` hook
that exits `2` to block the call. Both decide through `qa-guard-rules.mjs` and
block process termination commands before the bash tool runs, avoiding accidental
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

Claude Code/Codex load `pre-tool-use-qa-guard.mjs` as a PreToolUse hook (stderr +
exit 2); OpenCode loads `opencode-qa-guard.mjs` as a tool.execute.before plugin.
All five engines share `qa-guard-rules.mjs`. See [Agent adapters](AGENT_ADAPTERS.md).
