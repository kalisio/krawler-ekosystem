#!/usr/bin/env bash
set -euo pipefail
# set -x

# Detect which package is being released from a pushed git tag.
#
# Expected tag format (produced by `pnpm changeset publish`):
#   @kalisio/krawler@X.Y.Z              -> framework release
#   @kalisio/krawler-<name>@X.Y.Z       -> job release (all variants)
#
# Strategy:
#   1. Parse GITHUB_REF_NAME with the regex ^@([^/]+)/(.+)@(.+)$
#   2. Resolve the package directory under packages/
#   3. Cross-check the parsed version against package.json.version (must match)
#   4. Emit a target ("krawler" or "jobs") plus, for jobs, the per-variant matrix
#
# Output:
#   stdout         -> JSON matrix (jobs path only, framework path prints "[]")
#   stderr         -> log messages
#   GITHUB_OUTPUT  -> target, package, version, matrix, has_jobs
#
# Exits non-zero on:
#   - tag that doesn't match the expected Changesets format
#   - unknown package (no matching directory under packages/)
#   - mismatch between tag version and package.json.version
#
# Usage (dev mode):
#   GITHUB_REF_NAME='@kalisio/krawler@2.9.0' bash ./scripts/detect_release.sh
#   GITHUB_REF_NAME='@kalisio/krawler-meteofrance@1.5.0' bash ./scripts/detect_release.sh
#
# Usage (CI mode):
#   GITHUB_REF_NAME is injected by the workflow on push tag events.

THIS_FILE=$(readlink -f "${BASH_SOURCE[0]}")
THIS_DIR=$(dirname "$THIS_FILE")

. "$THIS_DIR/kash/kash.sh" >&2

REPO_ROOT=$(git rev-parse --show-toplevel)
PACKAGES_DIR="$REPO_ROOT/packages"

GITHUB_REF_NAME="${GITHUB_REF_NAME:-}"

if [[ -z "$GITHUB_REF_NAME" ]]; then
    echo "-> Error: GITHUB_REF_NAME is not set" >&2
    exit 1
fi

begin_group "Detect release ($GITHUB_REF_NAME)" >&2

#  Parse tag : @<scope>/<name>@<version>
if [[ ! "$GITHUB_REF_NAME" =~ ^@([^/]+)/(.+)@(.+)$ ]]; then
    echo "-> Error: tag '$GITHUB_REF_NAME' does not match expected format '@<scope>/<package>@<version>'" >&2
    exit 1
fi

SCOPE="${BASH_REMATCH[1]}"
PKG_NAME="${BASH_REMATCH[2]}"
TAG_VERSION="${BASH_REMATCH[3]}"

echo "-> scope=$SCOPE package=$PKG_NAME version=$TAG_VERSION" >&2

#  Resolve package directory.
#  The published name @kalisio/krawler maps to packages/krawler, while
#  @kalisio/krawler-<job> maps to packages/krawler-<job>. The PKG_NAME parsed
#  from the tag already matches the directory name in both cases.
PKG_DIR="$PACKAGES_DIR/$PKG_NAME"
if [[ ! -d "$PKG_DIR" ]]; then
    echo "-> Error: package directory '$PKG_DIR' does not exist" >&2
    exit 1
fi

#  Cross-check package.json.version against tag.
PKG_VERSION=$(jq -r '.version' "$PKG_DIR/package.json")
if [[ "$PKG_VERSION" != "$TAG_VERSION" ]]; then
    echo "-> Error: tag version '$TAG_VERSION' does not match $PKG_NAME/package.json version '$PKG_VERSION'" >&2
    exit 1
fi

#  Variants listing (same convention as detect_jobs.sh): a job has variants iff
#  it ships one or more `dockerfile.<variant>` files; otherwise the single
#  `dockerfile` produces one image with no variant.
_list_variants() {
    local PKG_DIR="$1"
    local HAS_VARIANTS=false
    local DF
    for DF in "$PKG_DIR"/dockerfile.*; do
        [[ -e "$DF" ]] || continue
        HAS_VARIANTS=true
        echo "${DF##*/dockerfile.}"
    done
    if [[ "$HAS_VARIANTS" == false ]]; then
        echo ""
    fi
}

#  Decide target and (for jobs) build matrix.
if [[ "$PKG_NAME" == "krawler" ]]; then
    TARGET="krawler"
    MATRIX_JSON='[]'
    HAS_JOBS=false
    echo "-> Framework release: kalisio/krawler:$TAG_VERSION" >&2
else
    TARGET="jobs"
    ENTRIES=()
    while IFS= read -r VARIANT; do
        ENTRIES+=("${PKG_NAME}|${VARIANT}")
    done < <(_list_variants "$PKG_DIR")

    MATRIX_JSON=$(printf '%s\n' "${ENTRIES[@]}" \
        | jq -Rn '[inputs | split("|") | {package: .[0], variant: .[1]}]')
    HAS_JOBS=true
    echo "-> Job release: $PKG_NAME v$TAG_VERSION" >&2
    echo "$MATRIX_JSON" | jq -r '.[] | "   - \(.package)\(if .variant != "" then " / \(.variant)" else "" end)"' >&2
fi

end_group "Detect release ($GITHUB_REF_NAME)" >&2

#  Write to GITHUB_OUTPUT when running in CI
if [[ "${CI:-false}" == "true" ]] && [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    MATRIX_ONELINE=$(echo "$MATRIX_JSON" | jq -c '.')
    {
        echo "target=${TARGET}"
        echo "package=${PKG_NAME}"
        echo "version=${TAG_VERSION}"
        echo "matrix=${MATRIX_ONELINE}"
        echo "has_jobs=${HAS_JOBS}"
    } >> "${GITHUB_OUTPUT}"
fi

echo "$MATRIX_JSON"
