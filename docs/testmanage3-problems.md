# Submit factory problems to TestManage3

The factory owns deciding which QA/review findings are problems. TestManage3 receives those problems in its ordinary Problems page, together with a link to the complete original report and the task Issue, delivered PR (when available), and Actions run links. It does not run an evaluation of its own.

Repository settings:

- `FACTORY_EVALUATION_DELIVERY=true`
- `EVALUATION_ENDPOINT=https://test3.nfvd.net/main/api/evaluations/import`
- `EVALUATION_AUTH_MODE=x-api-key`
- `EVALUATION_DELIVERY_FORMAT=testmanage3-links-v1`
- `EVALUATION_TIMEOUT_SECONDS=180` (optional; integer 30–300 seconds per attempt).
- Secret `EVALUATION_TOKEN`: the receiver's source-bound integration key.

The normal task completion reporter dispatches the existing delivery workflow. Its send step derives an explicit problem list from selected unresolved findings; strengths and resolved findings are excluded. QA-only runs submit concrete final failures, never unknown, skipped, blocked or repaired checks. Choosing the problems uses existing evidence and makes no model call.

## Feature point classification

In link mode each problem arrives already placed in one of TestManage3's feature points. The delivery workflow's `classify` job runs between `plan` and `send`:

1. One read-only step calls `GET …/api/evaluations/feature-points` next to the import endpoint, with the same source-bound key. Only this step and `send` receive `EVALUATION_TOKEN`.
2. Subject rules in `.github/evaluations/problem-feature-rules.json` map each problem's `subjectKeys` (the verified NocoBase3 package, Skill or guidance subjects) to a `dimension/feature` path in that list. General subjects such as `skill:nocobase-app-development` or `guide:app/AGENTS.md` are ignored. A problem is placed by rule only when every remaining subject resolves to the same feature point; problems owned by `factory` or `environment` are recorded as belonging to no feature point.
3. Mixed, unknown or subject-less problems, including QA-only failures, go to the selected Agent once per delivery run (`.github/prompts/classify-problems.md`). It may choose only a listed feature point or none, with a short reason. The Agent step has model credentials but no receiver token and no repository write access. No Agent is installed when the rules place everything.

Each problem then carries `classification: { featurePointId, method: "rule" | "model", reason }`, where `featurePointId` is `null` when no feature point fits. TestManage3 applies it only to a problem nobody has classified yet, marks it as automatic, and never overwrites a human decision; the classification does not take part in the submission's idempotency digest, so a resend with a different decision is not a conflict. If the feature point list cannot be read, the Agent fails, or its output is invalid, the affected problems are simply sent unclassified — delivery itself never waits on classification. The job's artifact keeps the decisions, the invocation record and any `failure.json` for 14 days.

Replaying a stored revision (`mode=replay`) classifies its problems again, which is how problems delivered before this feature receive a feature point. Update the rules when a new NocoBase3 package or a new feature point appears; a rule whose feature point is not in the receiver's current list simply does not fire.

Link delivery sends a small JSON envelope with structured report metadata, selected problems, and the immutable GitHub Pages HTML URL. ZIP, HTML and screenshot bytes stay in the factory archive; TestManage embeds the report URL directly. The current Pages source is the repository’s gh-pages archive, with the conventional owner.github.io/repository base. A custom Pages domain can redirect that base normally. Stable problem keys survive a review rerun, while source/task identity keeps separate tasks distinct. Receiver retries are idempotent and cannot overwrite human problem decisions. Full reports remain archived in the factory even when no problems were found; the receiver keeps metadata and a receipt without inventing a problem. A scheduled scan compensates for delivery failures.

Use `mode=replay` with a registered run key and revision to verify delivery without launching another build. Historical reports previously sent in bundle-only mode need an explicit replay to submit problems. Do not enable scheduled evaluation plans merely to enable problem reporting.

Omit the format variable, or set it to `bundle-v1`, for the original one-field generic receiver protocol.

Each attempt defaults to 180 seconds, with three bounded attempts and a 20-minute send budget. The budget accounts for the configured timeout before starting each item; remaining entries stay pending. The JSON body is capped at 4 MiB and protected by X-Evaluation-Payload-SHA256. X-Evaluation-Bundle-SHA256 continues to identify the source archive; in link mode it is a source assertion, not a receiver verification of downloaded bytes.

The legacy testmanage3-problems-v1 multipart format remains available for receivers that require local ZIP storage. Deploy receiver support before switching the format variable. Retries across formats retain the same archive identity, receipt and problem keys.
