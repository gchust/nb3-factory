# Re-check and fix framework problems with Claude Code

`framework-fix.yml` hands one TestManage problem to Claude Code. Claude Code re-checks it against the current `nocobase/nocobase3` source and, when the problem is real and the fix is contained, prepares a fix. The workflow then opens a draft PR on `nocobase/nocobase3` under the maintainer's GitHub account. Every run reports its verdict back to the problem in TestManage.

## Starting a run

- From TestManage: open a problem and choose **交给 Claude Code 复核修复**. TestManage records a fix run, then dispatches the workflow with `problem_id` and `external_run_id`.
- Manually: run the workflow from the Actions page, or run `gh workflow run framework-fix.yml -f problem_id=<id>`. Leave `external_run_id` empty. TestManage then registers the run when the workflow claims the problem. `base_ref` defaults to `develop` and must be `develop`, `main`, `release/*` or `release-beta/*`: the review job runs that branch's code beside the Claude credential, so feature branches are refused.

TestManage admits one active fix per problem. A manual run for a problem that already has an active fix fails at the claim.

## Jobs and credentials

Each job holds only the credential it needs:

| Job       | Credential                               | Does                                                                                                                                                                                                                                                             |
| --------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim`   | `EVALUATION_TOKEN`                       | Claims the problem through `POST /problem-fixes/factory/claims`, receives the frozen snapshot (description, comments and factory report links), and resolves the base commit.                                                                                    |
| `review`  | `CLAUDE_CODE_OAUTH_TOKEN`                | Checks out `nocobase/nocobase3` at that commit, installs its dependencies, and runs the pinned Claude Code once through the factory harness. It then turns the working tree into a patch (edits under `.github/` are dropped) and decides what may be published. |
| `publish` | `NOCOBASE3_PR_TOKEN`, `EVALUATION_TOKEN` | Applies the patch to a clean checkout, commits as the token's account, pushes `fix/testmanage-problem-<id>-<run>`, and opens a draft PR. Then posts the result through `POST /problem-fixes/factory/runs/<run>/result`. Never runs Agent or repository code.     |

The Agent never holds the PR token or the TestManage key, and it cannot push, open a PR or write to TestManage. Its only output is files plus a structured verdict file. A PR is opened only when all three hold:

- The verdict is `confirmed`.
- `fixed` is `true`.
- The patch is non-empty.

Every other outcome is reported without a PR, including a missing or invalid verdict and an abnormal Agent exit. Prose is never parsed for the decision.

## Results in TestManage

TestManage stores the verdict on the fix run and appends one comment to the problem: the verdict, the summary, the analysis, the checks Claude Code ran, the usage, and links to the PR and the Actions run. When a PR was opened and the problem is still `pending`, TestManage moves it to `fixing`; it changes no other status. Each result is recorded once, so rerunning the publish job does not add another comment. The `publish` job runs even after a review failure or cancellation, which releases the problem's active lock.

## Usage and duration

The harness records the one Claude Code invocation in `agent-fix.jsonl.result.json`. `decide` copies it into `decision.json` as `usage`, for every outcome, including a crash:

- `tokens`: `input`, `output`, `cacheRead`, `cacheWrite`, and their `total`.
- `durationMs`: the invocation's wall time.
- `turns` and `costUsd`: as Claude Code reports them. `costUsd` is a list-price estimate, not what a subscription is charged.
- `complete`: `false` when the result was not recorded in full.

Unknown values stay `null` rather than `0`; without a result file, `usage` is `null`. The usage appears in three places:

- The `publish` job's step summary, with the workflow time since the claim.
- The draft PR's references, as one English line.
- The TestManage result, as `usage`. TestManage shows it with the run and in the result comment. A TestManage deployment that predates the field rejects it as invalid input, so the result is then sent again without it.

The invocation runs with `FACTORY_AGENT_ROLE=framework-fix`, so its phase is `framework-fix` rather than an Issue build's `implementation`. The harness then fails an invocation that stalls instead of handing a partial workspace on. This ensures a stalled fix never becomes a PR.

## Configuration

| Name                          | Kind     | Purpose                                                                                                                                                                                                                               |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN`     | Secret   | Output of `claude setup-token` on the account whose Claude subscription pays for the runs.                                                                                                                                            |
| `NOCOBASE3_PR_TOKEN`          | Secret   | A token of the GitHub account that authors the PRs. It needs Contents and Pull requests write access on `nocobase/nocobase3`: use a fine-grained token if the organization allows them, otherwise a classic token with `public_repo`. |
| `EVALUATION_TOKEN`            | Secret   | Existing TestManage source-bound integration key, the same one used for report delivery.                                                                                                                                              |
| `TESTMANAGE_API_BASE`         | Variable | Optional. Defaults to `EVALUATION_ENDPOINT` without `/evaluations/import`.                                                                                                                                                            |
| `FRAMEWORK_FIX_CLAUDE_MODEL`  | Variable | Optional. Defaults to `opus`.                                                                                                                                                                                                         |
| `FRAMEWORK_FIX_CLAUDE_EFFORT` | Variable | Optional. Defaults to `high`.                                                                                                                                                                                                         |
| `CLAUDE_CODE_VERSION`         | Variable | Optional override of the pinned Claude Code version shared with the other factory workflows.                                                                                                                                          |

The workflow runs only from the default branch. This repository is public, so its Actions logs and artifacts are public too, including the Agent transcript (the harness redacts known credentials). Treat problem descriptions accordingly.
