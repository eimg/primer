#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

restore_fixture() {
  fixture_dir=$1
  bundle_path="$fixture_dir/.primer/history.bundle"

  if git -C "$fixture_dir" rev-parse --git-dir >/dev/null 2>&1; then
    echo "already restored: $fixture_dir"
    return
  fi

  git -C "$fixture_dir" init -b main
  git -C "$fixture_dir" fetch "$bundle_path" main
  git -C "$fixture_dir" reset --mixed FETCH_HEAD
  printf '%s\n' '.primer/history.bundle' >> "$fixture_dir/.git/info/exclude"
  echo "restored: $fixture_dir"
}

restore_fixture "$root_dir/sample-data/acme/sources/git/clientcore"
restore_fixture "$root_dir/sample-data/acme/sources/git/talentflow"
