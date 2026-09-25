# Submit factory problems to TestManage3

The factory owns deciding which QA/review findings are problems. TestManage3 receives those problems in its ordinary Problems page, together with the complete original report and the task Issue, delivered PR (when available), and Actions run links. It does not run an evaluation of its own.

Repository settings:

- `FACTORY_EVALUATION_DELIVERY=true`
- `EVALUATION_ENDPOINT=https://test3.nfvd.net/main/api/evaluations/import`
- `EVALUATION_AUTH_MODE=x-api-key`
- `EVALUATION_DELIVERY_FORMAT=testmanage3-problems-v1`
- Secret `EVALUATION_TOKEN`: the receiver's source-bound integration key.

The normal task completion reporter dispatches the existing delivery workflow. Its send step derives an explicit problem list from selected unresolved findings; strengths and resolved findings are excluded. QA-only runs submit concrete final failures, never unknown, skipped, blocked or repaired checks. This uses existing evidence and makes no model call.

Delivery includes the byte-for-byte original ZIP plus a `problems` JSON multipart field. Stable problem keys survive a review rerun, while source/task identity keeps separate tasks distinct. Receiver retries are idempotent and cannot overwrite human problem decisions. Full reports remain archived even when no problems were found. A scheduled scan compensates for delivery failures.

Use `mode=replay` with a registered run key and revision to verify delivery without launching another build. Historical reports previously sent in bundle-only mode need an explicit replay to submit problems. Do not enable scheduled evaluation plans merely to enable problem reporting.

Omit the format variable, or set it to `bundle-v1`, for the original one-field generic receiver protocol.
