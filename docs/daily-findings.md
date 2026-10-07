# Daily framework findings and the Feishu digest

`daily-findings.yml` is scheduled every day for 04:17 Asia/Shanghai; GitHub starts scheduled runs late, often by several hours, so run it from Actions with `workflow_dispatch` when the time matters. It closes the previous day into an archive of NocoBase3 framework findings under `reports/findings/daily/` on GitHub Pages. Once the Feishu digest is switched on, it also sends that day's findings to a Feishu group bot, mentioning the people responsible for each feature point, so the archived page and the digest cover the same findings. The digest is off by default. Nothing in it calls a model or runs application code.

## What a day contains

The archive covers the same findings as the [cross-report findings page](../.github/reports/README.md): findings owned by `framework`, `plugin`, `template` or `documentation` in the latest report of each Issue since the last findings reset. Closing day D archives every such finding that is not archived yet and whose run ended by the end of D in Asia/Shanghai. Each goes into the day its run ended, unless that day is already closed: a finding that appears after its day was closed, such as a re-review of an older run, goes into D instead and is marked as late (补录) with its own run date. Runs that end after D wait for their own day. A finding is identified by its report, finding ID and normalized title, so republishing the same report adds nothing, while a rewritten finding under the same ID counts as a new discovery.

The first run finds no archive yet. It rebuilds the earlier days from each run's end date and sends a digest only for the day it closes. After that, a day that was never closed, for example because GitHub dropped a scheduled run, is filled in the same way by the next close and sent with it. A closed day is final: closing it again adds nothing, so its page and its digest stay one set, and findings that appeared since wait for the next day. Only a day that has ended can be closed, and never one earlier than the last closed day.

Each finding is placed in a TestManage3 feature point by the subject rules in `.github/evaluations/problem-feature-rules.json`, the same rules the TestManage3 delivery applies first. It is placed only when every specific subject its evidence cites resolves to the same feature point. Otherwise it is listed under 未归入功能点 (not placed), together with every feature point it touches. The daily archive does not ask an Agent to place the rest, so TestManage3 may later place a problem that the archive leaves unplaced.

Pages:

- `reports/findings/daily/index.html` lists archived days and a separate pending preview grouped by run-end date in Asia/Shanghai. Report publication, classification publication, findings reset and daily closing refresh this preview. It exists even before the first daily close, links directly to each original finding, and explains the 04:17 schedule and possible Actions delays. Already archived keys are excluded; late findings are labelled for a future close. The preview does not modify closed days, queue messages or imply a digest was sent.
- `reports/findings/daily/<date>.html` lists one day by feature point, linking each finding to its report.
- `reports/findings/daily/<date>.json` and `index.json` hold the archived entries and the record of archived keys and unsent digests.

The findings page links to the archive. Everything there is public, so it names feature points and never people.

## Feishu setup

The digest stays off until the repository variable `FACTORY_FEISHU_DIGEST` is `true`. Until then no digest is queued or sent, even when the secrets below exist, and days archived meanwhile are never sent.

1. Add a custom bot to the Feishu group, turn on signature verification (签名校验), and copy the webhook and its `SEC…` secret.
2. Add the repository secrets `FEISHU_WEBHOOK_URL` and `FEISHU_WEBHOOK_SECRET`. The URL must be an `https://open.feishu.cn/open-apis/bot/v2/hook/…` or `open.larksuite.com` webhook.
3. Add the repository secret `FEISHU_PROBLEM_OWNERS` with the people to mention. It is spread over lines here for reading; store it as one line, because GitHub may fail to mask a multi-line structured secret:

```json
{
  "featurePoints": {
    "应用搭建/数据库": ["ou_xxxxxxxx"],
    "应用搭建/授权": ["ou_yyyyyyyy", "ou_zzzzzzzz"],
    "应用测试": ["ou_wwwwwwww"]
  },
  "default": ["ou_vvvvvvvv"]
}
```

Keys are feature point paths exactly as the rules file writes them, or a dimension alone (`应用测试`), which applies to every feature point under it without an entry of its own. `default` is mentioned for findings that are not placed and for feature points that have no entry. Values are Feishu Open IDs (`ou_…`) or user IDs, since custom bots cannot mention people by email. In external groups only Open IDs work. The people mentioned must be members of the group. An empty or missing secret sends the digest without mentions. Keys other than `featurePoints` and `default` fail the send step, and feature points or dimensions that no rule produces are reported as a warning in the run log. Both messages give only a count, never the keys or names: those are part of the mapping, so look for the typo in the secret itself.

The mapping is a secret, not a file or a variable, because the repository and its Actions logs are public: the runner prints each step's environment at the top of its log and masks only secrets. The scripts never print it, and the archive never stores it.

4. Set the repository variable `FACTORY_FEISHU_DIGEST` to `true`. The next run sends the day it closes.

## Sending

The digest is a Feishu rich-text (`post`) message: a summary line with severity counts and a link to the day's page, then one section per feature point that mentions its owners, listing each finding with its severity, a link to its report and its task. A not-placed finding also mentions the owners of each feature point it touches. Finding text is sent only in text and link nodes, which Feishu does not parse, so a title cannot add a mention. The message is kept under 18 KB by listing fewer findings per section and pointing to the page for the rest. A day with no new findings sends nothing.

A digest is queued only while `FACTORY_FEISHU_DIGEST` is `true`, `FEISHU_WEBHOOK_URL` is set and notification is on. The send step retries HTTP 429, HTTP 503, or a connection that was never established, twice. Each day is recorded in the ledger as soon as its send settles, so another day's send or a crash afterwards cannot make the next run resend it; that record is retried from a fresh `gh-pages` head when another writer moved it. Closing a day likewise retries from a fresh head when another writer moved `gh-pages`, up to five attempts with the report archive's growing, jittered pauses (1, 2, 4 and 8 seconds plus up to one second). If recording a delivered day keeps failing, the run fails with an error naming the day as "delivered but not recorded": forget it as below before the next run, or it is sent again.

After a timeout, a dropped connection or another 5xx response such as a 502 or 504 from a proxy, the message may already be in the chat. Such a day is marked `uncertain` in the ledger and the run stops sending, so later days stay plainly queued for the next run rather than becoming uncertain too. An uncertain day is never resent automatically; scheduled runs only print a warning naming it. A maintainer checks the chat and runs **Daily framework findings** by hand with the day in one of two inputs, each a comma-separated list of `YYYY-MM-DD` dates:

- `forget_uncertain`: the digest is in the chat, so the day is removed from the queue.
- `resend_uncertain`: the digest is missing, so the day is sent once more.

Keep `notify` on for such a dispatch: the send step, which reads both lists, does not run without it. A listed date that is not a real day fails the step before anything is sent; a real date that matches no queued day (or, for `resend_uncertain`, no uncertain day) is reported as a warning and ignored. If marking a day uncertain itself fails, the run ends with an error naming the day: check the chat and forget it before the next run, or it may be sent again.

When Feishu answers with an explicit rejection, for example because the signature does not match, the day was not posted: it stays queued and the next run sends it again together with its own day. A day still unsent after seven days is dropped, uncertain or not. Only the send step receives the webhook, its secret and the mapping. The archive step learns only whether a webhook exists.

## Running it by hand

Run **Daily framework findings** from Actions:

- `date` empty closes yesterday; `YYYY-MM-DD` closes that day, which must be earlier than today and not earlier than the last closed day. Closing the last closed day again adds nothing and only sends digests that are still queued.
- `notify` off archives without queueing a digest. Findings archived this way are never sent. While `FACTORY_FEISHU_DIGEST` is not `true`, every run behaves this way.

The job shares the `factory-task-usage` concurrency group with report publication, so its gh-pages commits and Pages deployment do not race a report being published. The send step takes the Pages base URL from `actions/configure-pages`, which is read-only and runs on every day, so a digest re-sent on a day with nothing new to archive links to the real site; only the deployment waits for a change. A transient failure of that step does not hold the digest back: the send step then uses the repository's default Pages URL. When the archive changed, the digest waits for a successful deployment so its links resolve.
