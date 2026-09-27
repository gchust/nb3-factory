# External build tasks

An external task manager creates a new Issue for each frozen task snapshot carrying
the `factory:external` label, closes it for archival, then dispatches
`code-agent-task.yml` with `issue_number` and `external_run_id`. The Issue opened/reopened event
does not start a build for this label. Explicit dispatch still uses the existing
input validation, queue, isolated QA, publisher and report delivery.

The caller owns idempotency, stores the returned Actions run id when available,
and reconciles uncertain submissions using the `request <external_run_id>` suffix
in the run title. Do not blindly retry a timed-out dispatch. Saving a draft or
comment does not dispatch. Every intentional new execution receives a new Issue
and working branch; idempotent retries reuse the same execution identity. Keep
previous Issue bodies and comments intact. The workflow advertises this behavior
with the `factory:external-closed-v1` capability marker.

Closed external Issues are accepted only for explicit external workflow dispatches
and their validated recovery/handoff chains. They stay closed during preparation
and publication; closure neither cancels a run nor represents business acceptance.
Ordinary closed Issues retain their existing stop behavior. A previous external
submission's unmerged PR does not block a new run against the same configured
application target: each new Issue publishes a separate PR for review.
Results keep the existing source/run-key/revision protocol; a receiver must match
the producer execution to the submitted request, not overwrite a newer run with a
late older report. The label is an automation guard, not an authorization grant.
