#!/bin/sh
# Static repository preflight; POSIX /bin/sh on macOS and Linux.
set -eu
fail=0
root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$root" ] || [ "$(pwd -P)" != "$(cd "$root" && pwd -P)" ]; then
  echo 'FAIL: run this at the root of the public app repository';exit 1
fi
case "$(basename "$root")" in implementation|PROJECT_WORKSPACE|planning-private) echo 'FAIL: wrong Git root';exit 1;; esac
required='README.md LICENSE SECURITY.md package.json package-lock.json Dockerfile .gitignore .dockerignore .editorconfig .nvmrc .env.example .github/workflows/ci.yml scripts/deploy.sh scripts/check-repo.sh docs/ARCHITECTURE.md src/client/App.tsx src/server/app.ts src/shared/contracts.ts'
for f in $required; do
 if [ ! -f "$f" ]; then echo "FAIL: missing required $f";fail=1;fi
done
list_file=$(mktemp)
git ls-files > "$list_file"
trap 'rm -f "$list_file"' EXIT HUP INT TERM
tracked_size=0
while IFS= read -r p; do
 [ -n "$p" ] || continue
 case "$p" in
   planning-private/*|*/planning-private/*|AGENTS.md|*.zip|*.sha256) echo "FAIL: private/trust file tracked $p";fail=1;;
 esac
 case "$p" in
   .env.example) :;;
   .env|.env.*|*/.env|*/.env.*) echo "FAIL: secret environment tracked $p";fail=1;;
 esac
 case "$p" in
   *.png|*.jpg|*.jpeg|*.webp|*.gif)
     case "$p" in public/og-image.png|public/og-image.jpg|public/og-image.webp)
       bytes=$(wc -c < "$p" | tr -d ' ')
       if [ "$bytes" -gt 153600 ]; then echo 'FAIL: social image >150KiB';fail=1;fi;;
     *) echo "FAIL: raster image policy $p";fail=1;;
     esac;;
 esac
 if [ -f "$p" ]; then
   bytes=$(wc -c < "$p" | tr -d ' ')
   case "$p" in
     package-lock.json) :;;
     *) tracked_size=$((tracked_size + bytes))
        if [ "$bytes" -gt 204800 ]; then echo "FAIL: file >200KiB $p";fail=1;fi;;
   esac
 fi
done < "$list_file"
if [ "$tracked_size" -gt 1572864 ]; then echo "FAIL: total tracked bytes excluding lockfile $tracked_size >1572864";fail=1;fi
if [ "$fail" -eq 0 ];then echo "PASS: tracked paths and size ($tracked_size bytes excl lockfile)";fi
# `-e` avoids interpreting the PRIVATE KEY marker as an option. Keep all patterns here, not in src.
scan_files=$(git ls-files 'src/*' 'public/*' '*.md')
if [ -n "$scan_files" ];then
 if printf '%s\n' "$scan_files" | xargs grep -nE -e '-----BEGIN (RSA|OPENSSH|EC|PRIVATE) PRIVATE KEY-----|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{24,}' 2>/dev/null;then
   echo 'FAIL: secret-shaped value found in tracked source/docs';fail=1
 else echo 'PASS: secret pattern scan (current tracked files only)';fi
fi
if grep -RnE 'TODO|FIXME|console[.]log' src 2>/dev/null;then echo 'FAIL: placeholder or console logging in src';fail=1
else echo 'PASS: source hygiene';fi
for heading in 'Problem' 'Features' 'Architecture' 'Run' 'Test' 'Security' 'Accessibility' 'Efficiency' 'Google services' 'Deployment' 'Requirement table';do
 if ! grep -Fq "## $heading" README.md;then echo "FAIL: README section missing $heading";fail=1;fi
done
if ! grep -Eq '^USER [^ ]+' Dockerfile || grep -Eq '^USER (0|root)( |$)' Dockerfile;then
 echo 'FAIL: Dockerfile lacks final non-root USER';fail=1
fi
major=$(tr -cd '0-9' < .nvmrc 2>/dev/null || true)
if [ -z "$major" ] || ! grep -Fq ">=$major." package.json;then
 echo 'FAIL: .nvmrc and package.json engines mismatch';fail=1
fi
branch_count=$(git branch --format='%(refname:short)' 2>/dev/null | grep -c . || true)
if [ "$branch_count" -gt 1 ];then echo 'FAIL: multiple local branches';fail=1;fi
if [ "$fail" -eq 0 ];then echo 'PASS: static repo checks';else echo 'FAIL: static repo checks';fi
exit "$fail"
