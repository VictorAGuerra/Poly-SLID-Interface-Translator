#!/usr/bin/env bash
# Publica os pacotes npm cuja versão ainda não está no registro, na ordem de
# dependência (core antes de react). Usado pelo workflow de release.
# DRY_RUN=1 simula sem publicar.
set -euo pipefail

out="$(pwd)/dist-npm"
rm -rf "$out" && mkdir -p "$out"

for dir in packages/core packages/react; do
  name=$(node -p "require('./$dir/package.json').name")
  version=$(node -p "require('./$dir/package.json').version")

  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "• $name@$version já está publicado; pulando."
    continue
  fi

  # pnpm pack troca "workspace:*" pela versão real da dependência.
  (cd "$dir" && pnpm pack --pack-destination "$out" >/dev/null)
  tarball="$out/$(echo "${name#@}" | tr / -)-$version.tgz"

  echo "• publicando $name@$version"
  if [ "${DRY_RUN:-}" = "1" ]; then
    npm publish "$tarball" --access public --dry-run
  else
    npm publish "$tarball" --access public
  fi
done
