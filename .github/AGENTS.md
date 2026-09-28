# Factory control plane

Everything under `.github/` is the factory: workflows, scripts, prompts and their guidance. It is copied over each refreshed baseline unchanged, so rules for developing the factory belong in this file or the documents beside it.

The root `AGENTS.md` and `CLAUDE.md` are the NocoBase3 application template's. A template refresh replaces them with the newly generated copies, every build task starts from them, and build reviews attribute what they say to NocoBase3. Never add factory rules there: they would be lost on the next refresh, and a defect in them would be reported to TestManage3 as a NocoBase3 template problem.

## Factory review history

Framework reviews prioritize the complete observable implementation, repair and QA histories. Stream and redact large JSONL records without dropping whole files, long events or accepted Handoff ancestors to fit a byte budget. Keep source hashes and reconstructable chunk locations. Deterministic event indexes aid navigation; they never replace raw tool calls and results.

Track input completeness separately from cited process coverage. A Skill inventory/hash is not proof of Skill use. New reviews must cite original events for each invoked phase and explicitly address indexed error signals; incomplete process coverage remains partial. Preserve versioned fingerprint validation for existing reports, and never reuse ancestor QA verdicts or double-count their usage.

## Factory task termination

Ordinary tasks and evaluation samples share the ceilings in `.github/scripts/task-policy.mjs`: five repair attempts, three observations of an identical failure per criterion/check, at most one five-hour Handoff, and ten hours of active implementation/repair/QA time. An evaluation plan can only tighten these limits. Pipeline state carries counters, failure fingerprints and elapsed time across handoffs and explicit recoveries; never clear them to get a task through.

A terminal limit saves `task-diagnostic.json` and `task-diagnostic.md`, preserves the patch and raw evidence, and runs at most one additional fifteen-minute read-only diagnosis using the independent reviewer. This cleanup cannot resume repairs, dispatch another continuation, or authorize final verification. Failed tasks still publish reports and create or update a build PR marked failed when a safe code diff exists. They may attempt preview packaging and deployment once without restarting repair or QA; preview failure does not block the report or PR or change the failed task status. Missing patches or empty diffs must be reported explicitly rather than fabricating a PR. Stopped checkpoints are not recoverable. Reject direct GitHub Re-run attempts for implementation/repair: they start fresh runners without restoring the previous attempt. Use explicit checkpoint recovery in a new Run for recoverable failures. Attribute framework, Skill, template, application, factory and environment issues from evidence; repeated failures alone are not proof of a NocoBase3 defect. Preserve unknown causes and incomplete diagnoses.

## Controlled failed-delivery smoke

The task workflow's opt-in failure_smoke dispatch input exercises failed publication without model calls or business QA. It requires a fresh, open Issue carrying factory:external, factory:failure-smoke, and the <!-- factory-failure-smoke:v1 --> disclosure. Do not use recovery or GitHub Re-run for this mode. The pinned code-only fixture comes from Issue #400 / PR #401; it carries its source SHA and patch digest and never copies earlier QA verdicts or screenshots. The agent job deliberately fails before QA; the existing failed PR, report, packaging and deployment jobs must handle it unchanged. Do not merge its application PR or describe successful preview deployment as successful business acceptance.

## Ordinary preset evaluation scope

Presets #206, #207 and #208 are ordinary application build tasks. Do not bind them implicitly to external evaluators in .github/evaluations/checks.json or require repository-level test credentials before implementation. Build the requested functionality first; after startup, prepare isolated local accounts and API keys through supported application APIs. Missing business AI or notification services block only the corresponding acceptance criteria and never imply those criteria passed. Keep normal factory quality checks and report incomplete business verification honestly. Explicit evaluation batches may declare required independent checks in their trusted manifests. The catalog is read whenever a run is prepared: runs that already executed keep their archived metadata and reports, while a new run of an existing #206–#208 task, #417–#419 included, starts without these gates.

## Problems delivered to TestManage3

TestManage3 receives NocoBase3 problems only: open findings owned by `framework`, `plugin`, `template` or `documentation`, the same set the framework findings page counts. Application, factory, environment and unknown-owner findings, and failed QA criteria without a review finding, stay in the factory report. See `docs/testmanage3-problems.md`.
