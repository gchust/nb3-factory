# External build tasks

An external task manager can mirror a frozen task snapshot into an Issue carrying
the `factory:external` label, then dispatch `code-agent-task.yml` with
`issue_number` and an optional `external_run_id`. The Issue opened/reopened event
does not start a build for this label. Explicit dispatch still uses the existing
input validation, queue, isolated QA, publisher and report delivery.

The caller owns idempotency, stores the returned Actions run id when available,
and reconciles uncertain submissions using the `request <external_run_id>` suffix
in the run title. Do not blindly retry a timed-out dispatch. Saving a draft or
comment does not dispatch. Subsequent runs may reuse the Issue and working branch.
Results keep the existing source/run-key/revision protocol; a receiver must match
the producer execution to the submitted request, not overwrite a newer run with a
late older report. The label is an automation guard, not an authorization grant.
