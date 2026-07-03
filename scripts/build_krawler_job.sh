#!/usr/bin/env bash
set -euo pipefail
# set -x

THIS_FILE=$(readlink -f "${BASH_SOURCE[0]}")
THIS_DIR=$(dirname "$THIS_FILE")
ROOT_DIR=$(dirname "$THIS_DIR")
WORKSPACE_DIR="$(dirname "$ROOT_DIR")"

. "$THIS_DIR/kash/kash.sh"

slack_report() {
    slack_ci_report "$ROOT_DIR" "$CI_STEP_NAME" "$KASH_EXIT_CODE" "$SLACK_WEBHOOK_JOBS"
}
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
            add_function_to_trap slack_report
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

load_env_files "$WORKSPACE_DIR/development/common/kalisio_dockerhub.enc.env"
# load_value_files "$WORKSPACE_DIR/development/common/KALISIO_DOCKERHUB_PASSWORD.enc.value"
KALISIO_DOCKERHUB_PASSWORD=$(mktemp)
decrypt_file "$WORKSPACE_DIR/development/common/KALISIO_DOCKERHUB_PASSWORD.enc.value" \
             "$KALISIO_DOCKERHUB_PASSWORD" > /dev/null


# While we have both the old krawler repository and the new krawler monorepo
# the rule is the following:
# - krawler builds from master branch produce 'dev' tag
# - jobs built from master branch produce 'dev' tag using 'dev' krawler as base
# - krawler and jobs built from tags use version from their respective package.json
# This is done to prevent breaking 'latest' krawler from old repo that is used by many other jobs
# and to prevent breaking 'latest' for jobs inside the monorepo while we need to test them.
# Once we settle on the monorepo we'll go back to using 'latest' tags for krawler and jobs.
if [ -z "$(get_git_tag "$ROOT_DIR")" ]; then
    : "${KRAWLER_TAG:=dev}"
    : "${JOB_DEFAULT_TAG:=dev}"
    export KRAWLER_TAG JOB_DEFAULT_TAG
fi

build_krawler_job \
    "$ROOT_DIR" \
    "$JOB_DIR" \
    "kalisio" \
    "$JOB_VARIANT" \
    "$KALISIO_DOCKERHUB_URL" \
    "$KALISIO_DOCKERHUB_USERNAME" \
    "$KALISIO_DOCKERHUB_PASSWORD" \
    "$PUBLISH"
