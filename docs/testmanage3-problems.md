# Submit factory problems to TestManage3

The factory owns deciding which QA/review findings are problems. TestManage3 receives those problems in its ordinary Problems page, together with a link to the complete original report and the task Issue, delivered PR (when available), and Actions run links. It does not run an evaluation of its own.

Repository settings:

- `FACTORY_EVALUATION_DELIVERY=true`
- `EVALUATION_ENDPOINT=https://test3.nfvd.net/main/api/evaluations/import`
- `EVALUATION_AUTH_MODE=x-api-key`
- `EVALUATION_DELIVERY_FORMAT=testmanage3-links-v1`
- `EVALUATION_TIMEOUT_SECONDS=180` (optional; integer 30–300 seconds per attempt).
- Secret `EVALUATION_TOKEN`: the receiver's source-bound integration key.

The normal task completion reporter dispatches the existing delivery workflow. Its send step derives an explicit problem list from selected unresolved findings; strengths and resolved findings are excluded. QA-only runs submit concrete final failures, never unknown, skipped, blocked or repaired checks. This uses existing evidence and makes no model call.

Link delivery sends a small JSON envelope with structured report metadata, selected problems, and the immutable GitHub Pages HTML URL. ZIP, HTML and screenshot bytes stay in the factory archive; TestManage embeds the report URL directly. The current Pages source is the repository’s gh-pages archive, with the conventional owner.github.io/repository base. A custom Pages domain can redirect that base normally. Stable problem keys survive a review rerun, while source/task identity keeps separate tasks distinct. Receiver retries are idempotent and cannot overwrite human problem decisions. Full reports remain archived in the factory even when no problems were found; the receiver keeps metadata and a receipt without inventing a problem. A scheduled scan compensates for delivery failures.

Use `mode=replay` with a registered run key and revision to verify delivery without launching another build. Historical reports previously sent in bundle-only mode need an explicit replay to submit problems. Do not enable scheduled evaluation plans merely to enable problem reporting.

Omit the format variable, or set it to `bundle-v1`, for the original one-field generic receiver protocol.

Each attempt defaults to 180 seconds, with three bounded attempts and a 20-minute send budget. The budget accounts for the configured timeout before starting each item; remaining entries stay pending. The JSON body is capped at 4 MiB and protected by X-Evaluation-Payload-SHA256. X-Evaluation-Bundle-SHA256 continues to identify the source archive; in link mode it is a source assertion, not a receiver verification of downloaded bytes.

The legacy testmanage3-problems-v1 multipart format remains available for receivers that require local ZIP storage. Deploy receiver support before switching the format variable. Retries across formats retain the same archive identity, receipt and problem keys.
