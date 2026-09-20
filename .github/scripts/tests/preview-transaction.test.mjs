import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

for (const action of ['rollback', 'commit']) {
  test(`preview ${action} preserves previous database and uploads`, (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'preview-txn-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const script = `
set -euo pipefail
. "$1"
PREVIEW_ROOT="$2"; pr=125; name=preview-pr-125; dir="$2/instances/pr-125"
mkdir -p "$dir/data" "$2/backups" "$2/containers"
printf old-db > "$dir/data/database.sqlite"
printf old-upload > "$dir/data/photo.png"
touch "$2/containers/$name"
log() { :; }
container_exists() { test -f "$PREVIEW_ROOT/containers/$1"; }
remove_container() { rm -f "$PREVIEW_ROOT/containers/$1"; }
docker() {
  case "$1" in
    rename) mv "$PREVIEW_ROOT/containers/$2" "$PREVIEW_ROOT/containers/$3" ;;
    stop|start) test -f "$PREVIEW_ROOT/containers/$2" ;;
    *) exit 99 ;;
  esac
}
preview_begin
! test -d "$dir"
mkdir -p "$dir/data"
printf new-db > "$dir/data/database.sqlite"
touch "$PREVIEW_ROOT/containers/$name"
preview_${action}
if [[ '${action}' == rollback ]]; then
  test "$(cat "$dir/data/database.sqlite")" = old-db
  test "$(cat "$dir/data/photo.png")" = old-upload
else
  test "$(cat "$dir/data/database.sqlite")" = new-db
  test "$(cat "$backup/instance/data/database.sqlite")" = old-db
  test "$(cat "$backup/instance/data/photo.png")" = old-upload
fi
test -f "$PREVIEW_ROOT/containers/$name"
! test -f "$PREVIEW_ROOT/containers/$name-previous"
`;
    const result = spawnSync(
      'bash',
      [
        '-c',
        script,
        'bash',
        path.resolve(import.meta.dirname, '../preview/preview-transaction.sh'),
        root,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
  });
}
