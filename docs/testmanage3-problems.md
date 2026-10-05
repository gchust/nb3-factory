# Submit factory problems to TestManage3

The factory owns deciding which QA/review findings are problems. TestManage3 receives those problems in its ordinary Problems page, together with a link to the complete original report and the task Issue, delivered PR (when available), and Actions run links. It does not run an evaluation of its own.

Repository settings:

- `FACTORY_EVALUATION_DELIVERY=true`
- `EVALUATION_ENDPOINT=https://nb3.nocobase.com/tm3/api/evaluations/import`
- `EVALUATION_AUTH_MODE=x-api-key`
- `EVALUATION_DELIVERY_FORMAT=testmanage3-links-v1`
- `EVALUATION_TIMEOUT_SECONDS=180` (optional; integer 30–300 seconds per attempt).
- Secret `EVALUATION_TOKEN`: the receiver's source-bound integration key.

The normal task completion reporter dispatches the existing delivery workflow. Its send step derives an explicit problem list from selected unresolved findings; strengths and resolved findings are excluded. Only NocoBase3 problems are submitted: findings owned by `framework`, `plugin`, `template` or `documentation`, the same set the framework findings page counts. Application, factory, environment and unknown-owner findings stay in the factory report, and failed QA criteria are never submitted on their own, because no finding attributes them to NocoBase3. Choosing the problems uses existing evidence and makes no model call.

## Feature point classification

In link mode each problem arrives already placed in one of TestManage3's feature points. The delivery workflow's `classify` job runs between `plan` and `send`:

1. One read-only step calls `GET …/api/evaluations/feature-points` next to the import endpoint, with the same source-bound key. Only this step and `send` receive `EVALUATION_TOKEN`.
2. Subject rules in `.github/evaluations/problem-feature-rules.json` map each problem's subjects to a `dimension/feature` path in that list. A problem's delivered `subjectKeys` cover every target of each review module it shares evidence with; classification uses only the targets whose evidence the problem's own findings cite, so a finding about `app/AGENTS.md` in a module that also reviewed the authentication plugin is not placed under authentication. General subjects such as `skill:nocobase-app-development` or `guide:app/AGENTS.md` are ignored. A problem is placed by rule only when every remaining subject resolves to the same feature point.
3. Mixed, unknown or subject-less problems, including those citing only general guidance, go to the selected Agent once per delivery run (`.github/prompts/classify-problems.md`). It may choose only a listed feature point or none, with a short reason. The Agent step has model credentials but no receiver token and no repository write access. No Agent is installed when the rules place everything.

Each problem then carries `classification: { featurePointId, method: "rule" | "model", reason }`, where `featurePointId` is `null` when no feature point fits. TestManage3 applies it only to a problem nobody has classified yet, marks it as automatic, and never overwrites a human decision; the classification does not take part in the submission's idempotency digest, so a resend with a different decision is not a conflict. If the feature point list cannot be read, the Agent fails, or its output is invalid, the affected problems are simply sent unclassified — delivery itself never waits on classification. The job's artifact keeps the decisions, the invocation record and any `failure.json` for 14 days.

Replaying a stored revision (`mode=replay`) classifies its problems again, which is how problems delivered before this feature receive a feature point. Update the rules when a new NocoBase3 package or a new feature point appears; a rule whose feature point is not in the receiver's current list simply does not fire.

## Repeated builds of the same task

Every build of a task is a new run with a new `run.key`, so a problem's `key` differs on every build. Each problem also carries a `fingerprint`: the same hash over its kind, owner, sorted subjects and normalized title, scoped to the task instead of the run. The task is `preset-<source Issue>` for a preset build, including every daily run of that preset, and `issue-<N>` otherwise, so repeated `/build` requests on one Issue share it too — the same case identity the independent review uses. Separate tasks never share a fingerprint, even for the same NocoBase3 defect.

TestManage3 records a problem whose fingerprint it already knows as another occurrence of that problem instead of a new one: its source links move to the latest report and its timeline gains a "reported again" entry. It merges into an open or cancelled problem, so a dismissed problem stays dismissed; a problem that returns after it was verified is collected as a new problem. The fingerprint, like the classification, is outside the submission's idempotency digest, so replaying a report delivered before fingerprints existed is not a conflict, and it fills in the fingerprint of the problem that report collected. Problems already duplicated before this change are not merged retroactively.

A fingerprint matches only the same normalized wording, and a later review often words the same defect differently. Each problem therefore also carries its `taskKey`, and the `classify` job judges rewording in the Agent call it already makes for feature points:

1. The feature point step also reads `GET …/api/evaluations/task-problems?task=<taskKey>` for the delivered tasks, at most 50 per request, with the same source-bound key. The receiver lists each task's problems that are not verified, with every fingerprint each is known by.
2. A problem whose fingerprint is among them needs no judgement. Every other problem of a task that has listed problems goes to the Agent in `duplicates.json` with that task's problems as candidates; the Agent is installed for this even when the rules place every problem.
3. The Agent answers each with one candidate's `problemId` or `null` and a reason (`.github/prompts/classify-problems.md`). It is told to merge only the same defect — same package or guide, trigger and wrong behavior — and to answer `null` when unsure, because a wrong merge hides a real problem while a missed one only leaves a problem for a person.

A problem judged a duplicate is sent with `duplicateOf: { problemId, reason }`; TestManage3 merges it only into a problem of the same source and task that is not verified, shows the reason on the timeline, and learns the new wording's fingerprint, so the next run that words it the same way merges without a judgement. The judgements, including `null` answers, stay in the job's `classification.json` artifact; only duplicates are sent. If the list cannot be read or the Agent fails, problems are sent without judgements and collected as new, as without this feature.

Deploy the receiver's support for `taskKey`, `fingerprint`, `duplicateOf` and the task problem list before this factory version delivers, since an older receiver rejects the fields.

Link delivery sends a small JSON envelope with structured report metadata, selected problems, and the immutable GitHub Pages HTML URL. ZIP, HTML and screenshot bytes stay in the factory archive; TestManage embeds the report URL directly. The current Pages source is the repository’s gh-pages archive, with the conventional owner.github.io/repository base. A custom Pages domain can redirect that base normally. Stable problem keys survive a review rerun, while source/task identity keeps separate tasks distinct. Receiver retries are idempotent and cannot overwrite human problem decisions. Full reports remain archived in the factory even when no problems were found; the receiver keeps metadata and a receipt without inventing a problem. A scheduled scan compensates for delivery failures, and resends a report rejected for a transient reason (`bad-request`, `accepted-not-stored` or another 5xx) once, at least an hour after the rejection, before it waits for a manual `retry-rejected`; authentication, path, size and data refusals such as `unprocessable` wait for a fix and a manual `retry-rejected` without an automatic resend. A refusal keeps only a short sanitized error code or message from the receiver's response, so a rejection such as `bad-request` can be traced without publishing the response body.

Use `mode=replay` with a registered run key and revision to verify delivery without launching another build. Historical reports previously sent in bundle-only mode need an explicit replay to submit problems. Do not enable scheduled evaluation plans merely to enable problem reporting.

Omit the format variable, or set it to `bundle-v1`, for the original one-field generic receiver protocol.

Each attempt defaults to 180 seconds, with three bounded attempts and a 20-minute send budget. The budget accounts for the configured timeout before starting each item; remaining entries stay pending. The JSON body is capped at 4 MiB and protected by X-Evaluation-Payload-SHA256. X-Evaluation-Bundle-SHA256 continues to identify the source archive; in link mode it is a source assertion, not a receiver verification of downloaded bytes.

The legacy testmanage3-problems-v1 multipart format remains available for receivers that require local ZIP storage. Deploy receiver support before switching the format variable. Retries across formats retain the same archive identity, receipt and problem keys.
