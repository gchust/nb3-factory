#!/usr/bin/env bash
set -euo pipefail
control="$(realpath "$1")"
candidate="$(realpath "$2")"
packages="$(realpath "$3")"
cd "$control"
# This isolated publisher reads data only and never runs generated application code.
node --input-type=module - "$candidate" "$packages" <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { validateDescriptor, hash } from './.github/scripts/source-snapshot.mjs';
const directory = process.argv[2];
const record = JSON.parse(readFileSync(`${directory}/candidate.json`));
const value = validateDescriptor(record.descriptor, process.env.GITHUB_REPOSITORY);
assert.equal(record.controlSha, process.env.FACTORY_CONTROL_SHA);
assert.equal(hash(readFileSync(process.argv[3])), value.sha256);
const fields = { SOURCE_TAG:value.tag, SOURCE_SHA:value.sourceSha,
  SOURCE_DIGEST:value.sha256, BASELINE_BRANCH:`factory-baseline/source-${value.sourceSha.slice(0,12)}-${value.runId}-${value.attempt}` };
writeFileSync(`${directory}/publication.env`, Object.entries(fields).map(([key,value])=>`${key}=${value}\n`).join(""));
NODE
source "$candidate/publication.env"
git bundle verify "$candidate/application.bundle"
git fetch --no-tags "$candidate/application.bundle" refs/heads/template:refs/remotes/source-candidate/template
ref=refs/remotes/source-candidate/template
test "$(git rev-list --count "$ref")" = 1
test "$(git rev-parse "$ref:.github")" = "$(git rev-parse "$FACTORY_CONTROL_SHA:.github")"
git show "$ref:factory-source.json" > "$candidate/from-git.json"
cmp "$candidate/from-git.json" "$candidate/factory-source.json"
# A replay may reuse the exact asset, but never overwrite different source bytes.
if ! gh release view "$SOURCE_TAG" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
  gh release create "$SOURCE_TAG" --repo "$GITHUB_REPOSITORY" --target "$FACTORY_CONTROL_SHA" --prerelease \
    --title "Verified NocoBase source ${SOURCE_SHA:0:12}" \
    --notes "Pinned source packages for isolated factory baselines. Not an upstream release or a business delivery."
fi
mkdir -p "$candidate/existing"
if gh release download "$SOURCE_TAG" --repo "$GITHUB_REPOSITORY" --pattern packages.tar.gz --dir "$candidate/existing"; then
  test "$(sha256sum "$candidate/existing/packages.tar.gz" | cut -d' ' -f1)" = "$SOURCE_DIGEST"
else
  gh release upload "$SOURCE_TAG" "$packages" --repo "$GITHUB_REPOSITORY"
fi
existing="$(git ls-remote origin "refs/heads/$BASELINE_BRANCH" | cut -f1)"
if [[ -n "$existing" ]]; then
  git fetch --no-tags origin "$existing"
  test "$(git rev-parse "$existing^{tree}")" = "$(git rev-parse "$ref^{tree}")"
  published="$existing"
else
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  published="$(git commit-tree "$ref^{tree}" -p "$FACTORY_CONTROL_SHA" -m "chore: materialize source baseline $SOURCE_SHA")"
  git push --force-with-lease="refs/heads/$BASELINE_BRANCH:" origin "$published:refs/heads/$BASELINE_BRANCH"
fi
{
  echo "### Verified source baseline"
  echo "Branch: \`$BASELINE_BRANCH\` · application commit: \`$published\`"
  echo "Source: \`$SOURCE_SHA\` · package archive SHA-256: \`$SOURCE_DIGEST\`"
  echo "Select this branch in a new preset task. Existing tasks and develop were not changed."
} >> "$GITHUB_STEP_SUMMARY"
if [[ -n "${TRACKING_ISSUE:-}" ]]; then
  gh issue comment "$TRACKING_ISSUE" --repo "$GITHUB_REPOSITORY" --body "源码基线已发布：\`$BASELINE_BRANCH\`（\`$published\`），源码 \`$SOURCE_SHA\`。包快照经过第二个干净 Runner 安装与完整验证；默认 develop 未改变。新建预置任务时可填写此测试基线分支。运行：https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
fi
