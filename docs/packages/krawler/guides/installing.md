---
title: Installing Krawler
description: CLI, module and Docker setups
---

# Installing Krawler

## As a Command-Line Interface (CLI)

Install it globally with your preferred package manager:

::: code-group

```bash [pnpm]
pnpm add -g @kalisio/krawler
```

```bash [npm]
npm install -g @kalisio/krawler
```

```bash [yarn]
yarn global add @kalisio/krawler
```

:::

You can now launch the CLI on a job file:

```bash
krawler jobfile.js
```

## As a module

As a dependency in another module/app:

::: code-group

```bash [pnpm]
pnpm add @kalisio/krawler
```

```bash [npm]
npm install @kalisio/krawler --save
```

```bash [yarn]
yarn add @kalisio/krawler
```

:::

Krawler is published as a native [ES module](https://nodejs.org/api/esm.html), so import the symbols you need:

```js
import { hooks, stores, tasks, jobs } from '@kalisio/krawler'
```

## In development mode

When contributing to Krawler or testing local changes, work from the [krawler-ekosystem](https://github.com/kalisio/krawler-ekosystem) monorepo, which is managed with [pnpm workspaces](https://pnpm.io/workspaces):

```bash
git clone https://github.com/kalisio/krawler-ekosystem
cd krawler-ekosystem
pnpm install
# Run the CLI from the workspace
pnpm --filter @kalisio/krawler exec krawler jobfile.js
```

Each job package under `packages/krawler-<job>` references the framework through the workspace, so a local change to `@kalisio/krawler` is immediately picked up by the jobs.

> Please refer to the [KDK documentation](https://kalisio.github.io/kdk/guides/development/setup.html) to set up your development environment.

## As a Docker container

A ready-to-use image is published on Docker Hub:

```bash
docker pull kalisio/krawler
```

When using Krawler as a Docker container, the arguments to the CLI have to be provided through the `ARGS` environment variable, along with any other required variables and the data volume to make inputs accessible within the container and to get output files back:

```bash
docker run --name krawler --rm \
  -v /mnt/data:/opt/krawler/data \
  -e "ARGS=/opt/krawler/data/jobfile.js" \
  -e S3_BUCKET=krawler \
  kalisio/krawler
```

::: tip
Job images are built **on top of** the published Krawler image. If you maintain a job in the monorepo, read [Building Krawler jobs](../../../building-jobs.md) to understand how the Krawler base version is pinned and how images are released.
:::
