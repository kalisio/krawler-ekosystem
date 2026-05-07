#!/usr/bin/env bash
set -euo pipefail
# set -x

THIS_FILE=$(readlink -f "${BASH_SOURCE[0]}")
THIS_DIR=$(dirname "$THIS_FILE")
ROOT_DIR=$(dirname "$THIS_DIR")
WORKSPACE_DIR="$(dirname "$ROOT_DIR")"

. "$THIS_DIR/kash/kash.sh"

## Parse options
##

JOB_PACKAGE=""
JOB_VARIANT=""
NODE_VER=20
PUBLISH=false
CI_STEP_NAME="Build job"
while getopts "j:v:n:pr:" option; do
    case $option in
        j) # job package directory name under packages/
            JOB_PACKAGE=$OPTARG
            ;;
        v) # variant (optional, e.g. "metar")
            JOB_VARIANT=$OPTARG
            ;;
        n) # node version (used for pnpm runtime that runs the build script)
            NODE_VER=$OPTARG
            ;;
        p) # publish image
            PUBLISH=true
            ;;
        r) # report outcome to slack
            CI_STEP_NAME=$OPTARG
            load_env_files "$WORKSPACE_DIR/development/common/SLACK_WEBHOOK_JOBS.enc.env"
            trap 'slack_ci_report "$ROOT_DIR" "$CI_STEP_NAME" "$?" "$SLACK_WEBHOOK_JOBS"' EXIT
            ;;
        *)
            ;;
    esac
done

if [ -z "$JOB_PACKAGE" ]; then
    echo "Usage: $0 -j <package> [-v <variant>] [-p] [-r <step>]" >&2
    exit 1
fi

JOB_DIR="$ROOT_DIR/packages/$JOB_PACKAGE"

use_node "$NODE_VER"

# The build:* npm scripts rely on cross-env / cross-env-shell, which are
# hoisted to the workspace root by pnpm. Install at the root so they end
# up on PATH when `pnpm --filter <job> run build` runs.
# --ignore-scripts skips the root `prepare: husky` hook (no husky in CI).
(cd "$ROOT_DIR" && pnpm install --frozen-lockfile --ignore-scripts)

load_env_files "$WORKSPACE_DIR/development/common/kalisio_dockerhub.enc.env"
load_value_files "$WORKSPACE_DIR/development/common/KALISIO_DOCKERHUB_PASSWORD.enc.value"

build_krawler_job \
    "$ROOT_DIR" \
    "$JOB_DIR" \
    "kalisio" \
    "$JOB_VARIANT" \
    "$KALISIO_DOCKERHUB_URL" \
    "$KALISIO_DOCKERHUB_USERNAME" \
    "$KALISIO_DOCKERHUB_PASSWORD" \
    "$PUBLISH"
