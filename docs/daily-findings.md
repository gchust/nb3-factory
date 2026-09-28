# Daily framework findings and the Feishu digest

`daily-findings.yml` runs every day at 04:17 Asia/Shanghai. It closes the previous day into an archive of NocoBase3 framework findings under `reports/findings/daily/` on GitHub Pages. Once the Feishu digest is switched on, it also sends that day's findings to a Feishu group bot, mentioning the people responsible for each feature point, so the archived page and the digest cover the same findings. The digest is off by default. Nothing in it calls a model or runs application code.

## What a day contains

The archive covers the same findings as the [cross-report findings page](../.github/reports/README.md): findings owned by `framework`, `plugin`, `template` or `documentation` in the latest report of each Issue since the last findings reset. Closing day D archives every such finding that is not archived yet and whose run ended by the end of D in Asia/Shanghai. Each goes into the day its run ended, unless that day is already closed: a finding that appears after its day was closed, such as a re-review of an older run, goes into D instead and is marked as late (补录) with its own run date. Runs that end after D wait for their own day. A finding is identified by its report, finding ID and normalized title, so republishing the same report adds nothing, while a rewritten finding under the same ID counts as a new discovery.

The first run finds no archive yet. It rebuilds the earlier days from each run's end date and sends a digest only for the day it closes. After that, a day that was never closed, for example because GitHub dropped a scheduled run, is filled in the same way by the next close and sent with it. A closed day is final: closing it again adds nothing, so its page and its digest stay one set, and findings that appeared since wait for the next day. Only a day that has ended can be closed, and never one earlier than the last closed day.

Each finding is placed in a TestManage3 feature point by the subject rules in `.github/evaluations/problem-feature-rules.json`, the same rules the TestManage3 delivery applies first. It is placed only when every specific subject its evidence cites resolves to the same feature point. Otherwise it is listed under 未归入功能点 (not placed), together with every feature point it touches. The daily archive does not ask an Agent to place the rest, so TestManage3 may later place a problem that the archive leaves unplaced.

Pages:

- `reports/findings/daily/index.html` lists the archived days with their counts.
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

Keys are feature point paths exactly as the rules file writes them, or a dimension alone (`应用测试`), which applies to every feature point under it without an entry of its own. `default` is mentioned for findings that are not placed and for feature points that have no entry. Values are Feishu Open IDs (`ou_…`) or user IDs, since custom bots cannot mention people by email. In external groups only Open IDs work. The people mentioned must be members of the group. An empty or missing secret sends the digest without mentions. Keys other than `featurePoints` and `default` fail the send step, and a feature point or dimension that no rule produces is reported as a warning in the run log.

The mapping is a secret, not a file or a variable, because the repository and its Actions logs are public: the runner prints each step's environment at the top of its log and masks only secrets. The scripts never print it, and the archive never stores it.

4. Set the repository variable `FACTORY_FEISHU_DIGEST` to `true`. The next run sends the day it closes.

## Sending

The digest is a Feishu rich-text (`post`) message: a summary line with severity counts and a link to the day's page, then one section per feature point that mentions its owners, listing each finding with its severity, a link to its report and its task. A not-placed finding also mentions the owners of each feature point it touches. Finding text is sent only in text and link nodes, which Feishu does not parse, so a title cannot add a mention. The message is kept under 18 KB by listing fewer findings per section and pointing to the page for the rest. A day with no new findings sends nothing.

A digest is queued only while `FACTORY_FEISHU_DIGEST` is `true`, `FEISHU_WEBHOOK_URL` is set and notification is on. The send step retries a network error, HTTP 429 or a 5xx response twice. When Feishu rejects a message, for example because the signature does not match, the day stays queued: the next run sends it again together with its own day, and a day still unsent after seven days is dropped. Only the send step receives the webhook, its secret and the mapping. The archive step learns only whether a webhook exists.

## Running it by hand

Run **Daily framework findings** from Actions:

- `date` empty closes yesterday; `YYYY-MM-DD` closes that day, which must be earlier than today and not earlier than the last closed day. Closing the last closed day again adds nothing and only sends digests that are still queued.
- `notify` off archives without queueing a digest. Findings archived this way are never sent. While `FACTORY_FEISHU_DIGEST` is not `true`, every run behaves this way.

The job shares the `factory-task-usage` concurrency group with report publication, so its gh-pages commits and Pages deployment do not race a report being published.
