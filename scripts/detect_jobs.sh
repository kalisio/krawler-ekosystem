#!/usr/bin/env bash
set -euo pipefail
# set -x

# Detect which Krawler jobs need to be built.
#
# Detection strategy (by priority):
#   1. INPUT_JOBS set -> use those entries directly (manual workflow_dispatch)
#      Format: space-separated "<package>[:<variant>]" tokens
#              (e.g. "krawler-openradiation krawler-meteofrance:arome-france")
#   2. DIFF_RANGE set -> use git diff to find modified job packages
#   3. Neither set    -> compute DIFF_RANGE from GitHub event variables,
#                        or include all jobs if first push / workflow_dispatch
#
# Cascade rule: changes outside any single job package (the krawler framework,
# the workspace root config, the build pipeline) trigger a rebuild of every job.
#
# Granularity: per-package, not per-variant. Any change inside
# packages/krawler-<job>/ rebuilds all variants of that job.
#
# Output:
#   stdout         -> JSON matrix include array (consumed by GH Actions fromJSON)
#                     [{"package":"krawler-openradiation","variant":""}, ...]
#   stderr         -> log messages
#   GITHUB_OUTPUT  -> matrix, has_jobs (when running in CI)
#
# Usage (dev mode):
#   INPUT_JOBS="krawler-openradiation krawler-meteofrance:arome-france" \
#       bash ./scripts/detect_jobs.sh
#   DIFF_RANGE="abc123..def456" bash ./scripts/detect_jobs.sh
#
# Usage (CI mode):
#   env vars are injected by the workflow, GITHUB_OUTPUT is written automatically.

THIS_FILE=$(readlink -f "${BASH_SOURCE[0]}")
THIS_DIR=$(dirname "$THIS_FILE")

. "$THIS_DIR/kash/kash.sh" >&2

REPO_ROOT=$(git rev-parse --show-toplevel)
PACKAGES_DIR="$REPO_ROOT/packages"

#  Input variables
INPUT_JOBS="${INPUT_JOBS:-}"
GITHUB_EVENT_NAME="${GITHUB_EVENT_NAME:-}"
GITHUB_EVENT_BEFORE="${GITHUB_EVENT_BEFORE:-}"
GITHUB_EVENT_AFTER="${GITHUB_EVENT_AFTER:-}"

#  Compute DIFF_RANGE if not explicitly set
if [[ -z "${DIFF_RANGE:-}" ]]; then
    if [[ "${GITHUB_EVENT_NAME}" == "workflow_dispatch" ]]; then
        DIFF_RANGE=""
        echo "-> workflow_dispatch: using INPUT_JOBS or including all jobs" >&2
    elif [[ "${GITHUB_EVENT_BEFORE}" == "0000000000000000000000000000000000000000" ]] || \
         [[ -z "${GITHUB_EVENT_BEFORE}" ]]; then
        DIFF_RANGE=""
        echo "-> First push on branch: including all jobs" >&2
    else
        DIFF_RANGE="${GITHUB_EVENT_BEFORE}..${GITHUB_EVENT_AFTER}"
        echo "-> Push: diff ${DIFF_RANGE}" >&2
    fi
fi

#  Helpers
#  ENTRIES is a bash array of "<package>|<variant>" strings (variant may be empty)
ENTRIES=()

_is_job_package() {
    local PKG="$1"
    # Job packages live under packages/ and follow the krawler-* naming.
    # The framework itself (packages/krawler) is excluded.
    [[ "$PKG" == krawler-* ]] && [[ -d "$PACKAGES_DIR/$PKG" ]]
}

_list_variants() {
    # Print variants of a job package, one per line.
    # If only `dockerfile` exists, prints a single empty line (no variant).
    # If `dockerfile.<variant>` files exist, prints each <variant>.
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

_add_entry() {
    # Add a single (package, variant) entry. Dedup.
    local PKG="$1"
    local VARIANT="$2"
    local KEY="${PKG}|${VARIANT}"
    local E
    for E in "${ENTRIES[@]:-}"; do
        [[ "$E" == "$KEY" ]] && return
    done
    ENTRIES+=("$KEY")
}

_add_package_all_variants() {
    local PKG="$1"
    if ! _is_job_package "$PKG"; then
        echo "-> Skipping non-job package '$PKG'" >&2
        return
    fi
    local VARIANT
    while IFS= read -r VARIANT; do
        _add_entry "$PKG" "$VARIANT"
    done < <(_list_variants "$PACKAGES_DIR/$PKG")
}

_add_all_jobs() {
    local PKG_DIR
    for PKG_DIR in "$PACKAGES_DIR"/krawler-*/; do
        [[ -d "$PKG_DIR" ]] || continue
        local PKG
        PKG=$(basename "$PKG_DIR")
        # Skip the framework itself even if naming matched
        [[ "$PKG" == "krawler" ]] && continue
        _add_package_all_variants "$PKG"
    done
}

# Paths that trigger a cascade (rebuild of every job)
_is_cascade_path() {
    local FILE="$1"
    case "$FILE" in
        packages/krawler/*)        return 0 ;;
        pnpm-lock.yaml)            return 0 ;;
        pnpm-workspace.yaml)       return 0 ;;
        package.json)              return 0 ;;
        scripts/build_krawler_job.sh) return 0 ;;
        scripts/detect_jobs.sh)    return 0 ;;
        scripts/kash/*)            return 0 ;;
        .github/workflows/main.yaml) return 0 ;;
    esac
    return 1
}

begin_group "Detect jobs" >&2

# 1: jobs provided manually
if [[ -n "${INPUT_JOBS}" ]]; then
    echo "-> Job(s) provided manually: ${INPUT_JOBS}" >&2
    for TOKEN in ${INPUT_JOBS}; do
        if [[ "$TOKEN" == *:* ]]; then
            PKG="${TOKEN%%:*}"
            VARIANT="${TOKEN#*:}"
            if ! _is_job_package "$PKG"; then
                echo "-> Error: job package '$PKG' not found, aborting" >&2
                exit 1
            fi
            _add_entry "$PKG" "$VARIANT"
        else
            _add_package_all_variants "$TOKEN"
        fi
    done

# 2: no diff range -> include all jobs
elif [[ -z "${DIFF_RANGE}" ]]; then
    echo "-> No diff range: including all jobs" >&2
    _add_all_jobs

# 3: diff range -> detect from git diff
else
    CHANGED_FILES=$(git diff --name-only "${DIFF_RANGE}" 2>/dev/null || true)
    if [[ -z "$CHANGED_FILES" ]]; then
        echo "-> No files changed in diff range" >&2
    fi

    CASCADE=false
    while IFS= read -r FILE; do
        [[ -z "$FILE" ]] && continue
        if _is_cascade_path "$FILE"; then
            echo "-> Cascade trigger: $FILE" >&2
            CASCADE=true
            break
        fi
    done <<< "$CHANGED_FILES"

    if [[ "$CASCADE" == true ]]; then
        echo "-> Cascading to all jobs" >&2
        _add_all_jobs
    else
        while IFS= read -r FILE; do
            [[ -z "$FILE" ]] && continue
            case "$FILE" in
                packages/krawler-*/*)
                    PKG=$(echo "$FILE" | cut -d'/' -f2)
                    _add_package_all_variants "$PKG"
                    ;;
            esac
        done <<< "$CHANGED_FILES"
    fi
fi

#  Build JSON matrix
if [[ ${#ENTRIES[@]} -eq 0 ]]; then
    MATRIX_JSON='[]'
    HAS_JOBS=false
    echo "-> No jobs to process." >&2
else
    MATRIX_JSON=$(printf '%s\n' "${ENTRIES[@]}" \
        | jq -Rn '[inputs | split("|") | {package: .[0], variant: .[1]}]')
    HAS_JOBS=true
    echo "-> Jobs to process:" >&2
    echo "$MATRIX_JSON" | jq -r '.[] | "   - \(.package)\(if .variant != "" then " / \(.variant)" else "" end)"' >&2
fi

end_group "Detect jobs" >&2

#  Write to GITHUB_OUTPUT when running in CI
if [[ "${CI:-false}" == "true" ]] && [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    # JSON must be on a single line for GITHUB_OUTPUT
    MATRIX_ONELINE=$(echo "$MATRIX_JSON" | jq -c '.')
    {
        echo "matrix=${MATRIX_ONELINE}"
        echo "has_jobs=${HAS_JOBS}"
    } >> "${GITHUB_OUTPUT}"
fi

echo "$MATRIX_JSON"
