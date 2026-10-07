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
explicit recovery from that run still accepts it. It requests no report, and
the progress reporter ignores such an attempt, so no empty progress, usage,
history or retro replaces the Issue's real one; it answers no comment either.
"Re-run all jobs" stops at the start of prepare once an earlier attempt ran
the build, before it records a new attempt, uploads a second task artifact,
relabels the Issue or posts a status; its reports are marked handled without
being requested, so nothing is published for that attempt. Recover a failed
build with `recovery_run_id`, or start a new run. The one exception is a run
whose earlier attempts never started the agent job, for example because
prepare failed on a transient error: nothing was executed or saved, so both
guards accept the re-run as the task's first execution.

A failed build usually published its patch on the work branch as a PR marked
failed before the notice offered recovery. The publication records the commit
it pushed (`factory-published-<issue>`), and a recovery treats a work branch
still at exactly that commit as unmoved: it keeps the recorded base and
replaces that commit, with a push lease on it. Any other commit on the work
branch is newer work, and the recovery refuses. A shared target branch is
compared with the task's pinned base receipt, not its live head.

A continuation retries its checkpoint and task downloads once, and runs them
and the control-plane verification before it checks out the application. If
it still fails, or is cancelled (its runner limit included), after both
downloads but before restoring its progress (the application checkout,
applying the patch, sample admission, the restore itself), it keeps the whole
handed-off checkpoint as its own, marked failed, but only when the checkpoint
is one it could have restored: the same task input, patch and control plane, not
stopped, an unchanged budget, a repair checkpoint with its diagnostic context,
and an evaluation sample that was not refused. A refused control-plane
verification, or any checkpoint rejected on purpose, is not kept, published or
offered for recovery. Recover a kept one with `recovery_run_id` set to that continuation,
since its source run concluded successfully when it handed off. A
continuation whose own task branch moved during the handoff stops at once
instead of failing at the final push.

A run that reached its runner budget and saved a handoff checkpoint, but whose
checkpoint upload or continuation dispatch failed, has no successor. Its
failure notice offers recovery from it, and a recovery accepts a checkpoint
that records a handoff only when the source run's "Dispatch continuation run"
step did not succeed and no continuation names that run as its source (a
dispatch that timed out may still have reached GitHub). A handoff refused by a
spent budget records its stop instead and stays unrecoverable. A recovery
uploads only the files its prepare normalized; the agent job downloads the
failed run's checkpoint itself and checks it is the one prepare validated
(`handoff-recovery.mjs match`).

Regression checks: `pnpm factory:test`. A task keeps the control plane it
recorded as `control_sha` for its continuations and recoveries, so an
Issue-driven integration test of a fix must start a new task after the fix is
on the default branch.

Claude Code/Codex load `pre-tool-use-qa-guard.mjs` as a PreToolUse hook (stderr +
exit 2); OpenCode loads `opencode-qa-guard.mjs` as a tool.execute.before plugin.
All five engines share `qa-guard-rules.mjs`. See [Agent adapters](AGENT_ADAPTERS.md).
