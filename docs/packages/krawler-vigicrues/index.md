---
title: krawler-vigicrues
description: A Krawler based service to download data from French flood warning system Vigicrues
---

# krawler-vigicrues

_A Krawler based service to download data from French flood warning system Vigicrues_

## Overview

The **krawler-vigicrues** job scrapes flood alerts from the following services: [https://www.vigicrues.gouv.fr/services/1/](https://www.vigicrues.gouv.fr/services/1/). The downloaded data are stored in a [MongoDB](https://www.mongodb.com/) database and more precisely in the collection `vigicrues`.

All records are stored in [GeoJson](https://fr.wikipedia.org/wiki/GeoJSON) format.

The job is executed according a specific cron expression. By default every 3 hours.

To get support from **Vigicrues**, use the following contact address: <vigicrues@developpement-durable.gouv.fr>

## Configuration

| Variable | Description |
|--- | --- |
| `DB_URL` | The mongoDB database URL. The default value is `mongodb://127.0.0.1:27017/vigicrues`. |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

## Deployment

We personally use [Kargo](https://kalisio.github.io/kargo/) to deploy the service.

## Installation

Install with your preferred package manager:

::: code-group

```bash [pnpm]
pnpm add @kalisio/krawler-vigicrues
```

```bash [npm]
npm install @kalisio/krawler-vigicrues
```

```bash [yarn]
yarn add @kalisio/krawler-vigicrues
```

:::

