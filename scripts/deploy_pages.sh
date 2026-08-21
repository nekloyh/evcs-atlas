#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "deploy-pages: phải chạy từ nhánh main" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "deploy-pages: worktree phải sạch" >&2
  exit 1
fi

git fetch origin main
source_commit="$(git rev-parse HEAD)"
remote_main="$(git rev-parse origin/main)"
if [[ "$source_commit" != "$remote_main" ]]; then
  echo "deploy-pages: HEAD không khớp origin/main" >&2
  exit 1
fi

if [[ ! -f web/public/data/p/01/manifest.json ]]; then
  echo "deploy-pages: thiếu web/public/data; không thể tạo site đầy đủ" >&2
  exit 1
fi

province_count="$(find web/public/data/p -mindepth 2 -maxdepth 2 -name manifest.json -type f | wc -l)"
if [[ "$province_count" -ne 34 ]]; then
  echo "deploy-pages: cần 34 manifest tỉnh, tìm thấy $province_count" >&2
  exit 1
fi

(
  cd web
  pnpm run build:pages
)

if [[ ! -f web/dist/.nojekyll ]]; then
  echo "deploy-pages: artifact thiếu .nojekyll" >&2
  exit 1
fi

site_bytes="$(du -sb web/dist | cut -f1)"
max_file_bytes="$(find web/dist -type f -printf '%s\n' | sort -nr | head -n 1)"
if (( site_bytes >= 1000000000 )); then
  echo "deploy-pages: site $site_bytes byte vượt giới hạn 1 GB của Pages" >&2
  exit 1
fi
if (( max_file_bytes >= 100000000 )); then
  echo "deploy-pages: file $max_file_bytes byte vượt giới hạn 100 MB của GitHub" >&2
  exit 1
fi

deploy_tmp="$(mktemp -d /tmp/evcs-pages.XXXXXX)"
case "$deploy_tmp" in
  /tmp/evcs-pages.*) ;;
  *) echo "deploy-pages: thư mục tạm không hợp lệ: $deploy_tmp" >&2; exit 1 ;;
esac
cleanup() {
  case "$deploy_tmp" in
    /tmp/evcs-pages.*) rm -rf -- "$deploy_tmp" ;;
  esac
}
trap cleanup EXIT

cp -a web/dist/. "$deploy_tmp/"
printf '%s\n' "$source_commit" > "$deploy_tmp/SOURCE_COMMIT"

git -C "$deploy_tmp" init -b gh-pages
git -C "$deploy_tmp" config user.name "$(git config user.name)"
git -C "$deploy_tmp" config user.email "$(git config user.email)"
git -C "$deploy_tmp" add --all
git -C "$deploy_tmp" commit -m "deploy: evcs-atlas ${source_commit:0:12}"
git -C "$deploy_tmp" remote add origin "$(git remote get-url origin)"

old_pages="$(git ls-remote origin refs/heads/gh-pages | cut -f1)"
if [[ -n "$old_pages" ]]; then
  git -C "$deploy_tmp" push \
    --force-with-lease="refs/heads/gh-pages:$old_pages" \
    origin gh-pages:gh-pages
else
  git -C "$deploy_tmp" push origin gh-pages:gh-pages
fi

echo "deploy-pages: source=$source_commit bytes=$site_bytes max_file=$max_file_bytes"
