---
outline: [2, 3]
---

# Building Krawler jobs

This document describes how Krawler job images are built and released in **krawler-ekosystem**, and how the framework (`@kalisio/krawler`) relates to the jobs at build time.

## Architecture

Each job package in `packages/krawler-<job>/` ships its own Docker image, derived from the published Krawler image via a two-stage build:

```dockerfile
FROM kalisio/krawler:${KRAWLER_TAG}
```

The `KRAWLER_TAG` is **the single point that decides which Krawler version a job runs on**. It is resolved at `docker build` time from:

1. an explicit `KRAWLER_TAG` env var if set (used by CI on master to force `latest`), or
2. the `krawler.version` field in the job's `package.json` otherwise (used on release tags).

The job's npm `build` script wires this:

```json
"build": "DOCKER_BUILDKIT=1 docker build --build-arg KRAWLER_TAG=${KRAWLER_TAG:-$(node -p \"require('./package.json').krawler.version\")} ..."
```

::: warning
The `peerDependencies["@kalisio/krawler"]` entry in a job's `package.json` only exists for pnpm workspace symlink resolution. **It does not drive the build version** — only `krawler.version` does.
:::

## Master vs tag

Krawler and the jobs have independent release cycles. The CI distinguishes two flows:

| Event | CI action | Image produced | Krawler base |
|---|---|---|---|
| Push on `master` (Krawler, unless `skip krawler` in commit msg) | build Krawler | `kalisio/krawler:dev` | n/a |
| Push on `master` (job, with `build jobs` in commit msg) | build the job (all variants) | `<job>:dev` | `kalisio/krawler:latest` |
| Tag `@kalisio/krawler@X.Y.Z` | release Krawler | `kalisio/krawler:X.Y.Z` | n/a |
| Tag `@kalisio/krawler-<job>@X.Y.Z` | release the job (all variants) | `<job>:X.Y.Z` | `kalisio/krawler:<package.json.krawler.version>` |

Design rationale:

- **Master Krawler does not cascade to jobs.** A broken Krawler in master must not silently break every `<job>:dev`. Jobs pick up new Krawler lazily, on their next own build, and only based on the **last released** Krawler (`:latest`), not on the bleeding-edge `:dev`.
- **`<job>:dev` rebases on `krawler:latest`.** `:latest` is stable (last release), so a broken Krawler in master never poisons `<job>:dev`. Jobs publish under `:dev` to make it obvious which images come from a master build vs a release.
- **`<job>:X.Y.Z` pins on `krawler.version`.** Releases must be reproducible — six months later, the same tag must produce the same image.
- **Jobs always build `FROM kalisio/krawler:<tag>`, never from sources.** Consistent with out-of-monorepo jobs which don't have access to Krawler sources.

## Release flow (Changesets)

Releases are driven by [Changesets](https://github.com/changesets/changesets):

```bash
# 1. record intent
pnpm changeset

# 2. apply version bumps to package.json + CHANGELOG.md
pnpm changeset:version

# 3. publish to npm and create git tags
pnpm changeset:publish

# 4. push the tags
git push --follow-tags
```

Step 4 triggers the CI release path:

- A tag matching `@kalisio/krawler@X.Y.Z` runs `release_krawler` → builds and pushes `kalisio/krawler:X.Y.Z` on DockerHub.
- A tag matching `@kalisio/krawler-<job>@X.Y.Z` runs `release_jobs` → builds and pushes `<job>:X.Y.Z` (one image per variant).

The release detector (`scripts/detect_release.sh`) cross-checks the tag version against `package.json.version` and fails the CI if they diverge.

### Configuration

`.changeset/config.json` is set to `"updateInternalDependencies": false`. This means a Krawler bump **does not** generate automatic patches on the jobs. Jobs upgrade Krawler **explicitly** by bumping `krawler.version`.

## Upgrading a job's Krawler base

Currently a manual edit:

```jsonc
// packages/krawler-<job>/package.json
{
  "krawler": { "version": "2.9.0" }
}
```

Bump the field, commit, and the next release of that job (whether `:latest` on master push or `:X.Y.Z` on tag push) will rebase on the new Krawler version.

## Manual builds

Outside of CI you can drive a build with the same wrapper:

```bash
# Use whatever Krawler base + image tag you want
KRAWLER_TAG=2.8.2 TAG=2.8.2 pnpm --filter @kalisio/krawler-openradiation run build

# Build a single variant
KRAWLER_TAG=latest TAG=latest pnpm --filter @kalisio/krawler-meteofrance run build:arome-france
```

`TAG` overrides the local image tag; `KRAWLER_TAG` overrides the Krawler base. Both env vars are honored by the job's `build` script.

## CI internals

- [`scripts/detect_jobs.sh`](https://github.com/kalisio/krawler-ekosystem/blob/master/scripts/detect_jobs.sh) — master path: detects which jobs to rebuild from a git diff. Includes a cascade list (lockfile, build scripts) that triggers all jobs when modified.
- [`scripts/detect_release.sh`](https://github.com/kalisio/krawler-ekosystem/blob/master/scripts/detect_release.sh) — tag path: parses `GITHUB_REF_NAME`, resolves the target package, and emits the per-variant build matrix.
- [`scripts/build_krawler.sh`](https://github.com/kalisio/krawler-ekosystem/blob/master/scripts/build_krawler.sh) — builds the Krawler framework image. Called by the `build_krawler` job on master push (pushes `:dev`) and by `release_krawler` on tag (pushes `:X.Y.Z`). Defaults `KRAWLER_TAG="dev"` outside of a tag.
- [`scripts/build_krawler_job.sh`](https://github.com/kalisio/krawler-ekosystem/blob/master/scripts/build_krawler_job.sh) — builds a single job image. Outside of a tag, exports `KRAWLER_TAG=latest` (so the job rebases on the last released `kalisio/krawler:latest`, not on the bleeding-edge `:dev`) and `JOB_DEFAULT_TAG=dev` (so the job image itself is published as `<job>:dev`). On tag, leaves both unset so the job's `krawler.version` wins for the base and `$VERSION` for the image tag.
- [`.github/workflows/main.yaml`](https://github.com/kalisio/krawler-ekosystem/blob/master/.github/workflows/main.yaml) — orchestration. Master-path jobs are gated on `ref_type == 'branch'`; release-path jobs trigger on tags matching `'@*/*@*'`.
