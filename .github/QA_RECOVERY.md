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

After an implementation or verification failure, the factory still seals the
application diff, with protected paths removed by the same patch policy, and
uploads it in `factory-agent-<issue>`. That artifact is also the recovery
checkpoint: it counts as one only when patch creation succeeded and the upload
carries the patch, pipeline state and task metadata. Runs made before this was
introduced also uploaded the same files as `factory-handoff-<issue>`. The failed
job stays failed, so final verification does not run, but the task still
publishes its reports and creates or updates a build PR marked failed when a
safe code diff exists. A failed checkpoint never dispatches another run by
itself.

To recover, fix the cause first, then run the Code Agent NocoBase Task workflow
through `workflow_dispatch` with `issue_number` and `recovery_run_id` set to the
failed run; the failure notice on the Issue gives both values. The new run
restores the checkpoint, keeps the task's counters and pinned control plane,
and continues the saved phase. [RECOVERY.md](RECOVERY.md) lists which failures
are recoverable and what the recovery checks. Artifacts expire after 14 days. A
GitHub Re-run of the agent job is always rejected before any work, for a
continuation too, because a fresh runner cannot preserve the task's limits.
Such a rejected Re-run leaves the earlier attempt's checkpoint intact, and an
explicit recovery from that run still accepts it. It requests only the progress
report, so no empty usage, history or retro replaces the Issue's real one, and
it answers no comment. "Re-run all jobs" stops at the start of prepare once an
earlier attempt saved the task, before it records a new attempt, uploads a
second task artifact, relabels the Issue or posts a status.

A continuation retries its checkpoint and task downloads once. If it still
fails after downloading the checkpoint but before restoring its progress, it
keeps the handed-off checkpoint as its own, marked failed: recover it with
`recovery_run_id` set to that continuation, since its source run concluded
successfully when it handed off. A continuation whose own task branch moved
during the handoff stops at once instead of failing at the final push.

Regression checks: `pnpm factory:test`. A task keeps the control plane it
recorded as `control_sha` for its continuations and recoveries, so an
Issue-driven integration test of a fix must start a new task after the fix is
on the default branch.

Claude Code/Codex load `pre-tool-use-qa-guard.mjs` as a PreToolUse hook (stderr +
exit 2); OpenCode loads `opencode-qa-guard.mjs` as a tool.execute.before plugin.
All five engines share `qa-guard-rules.mjs`. See [Agent adapters](AGENT_ADAPTERS.md).
