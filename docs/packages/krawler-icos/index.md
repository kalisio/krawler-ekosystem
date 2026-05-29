---
title: krawler-icos
description: A Krawler based service to download atmospheric data from the ICOS Data Portal.
---

# krawler-icos

_A Krawler based service to download atmospheric data from the [ICOS Data Portal](https://data.icos-cp.eu/portal/)._

## Overview

The **krawler-icos** job scrapes atmospheric data from the [ICOS API](https://www.icos-cp.eu/). The downloaded data are stored within a [MongoDB](https://www.mongodb.com/) database in 2 collections:
* the `icos-observations` collection stores the observation data
* the `icos-stations` collection stores the station positions

All records are stored in [GeoJson](https://fr.wikipedia.org/wiki/GeoJSON) format.

The project consists in 2 jobs:
* the `stations` job scrapes the available stations according a specific cron expression. By default, every day at midnight.
* the `observations` job scrapes the observations data according a specific cron expression. By default every hour.

## Configuration

### Stations

| Variable | Description |
|--- | --- |
| `DB_URL` | The database URL. The default value is `mongodb://127.0.0.1:27017/icos` |
| `OBJECT_SPEC_FILTER` | A filter used to select only latest data objects containing this pattern. The default value is `radon data`, could be eg `CO data`, `CO2 data`, `CH4 data` |
| `HISTORY` | The duration of the observations data history the job has to download. It must be expressed in seconds and the default value is `86 400 000` (1 day) |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

### Observations

| Variable | Description |
|--- | --- |
| `DB_URL` | The database URL. The default value is `mongodb://127.0.0.1:27017/icos` |
| `TTL` | The observations data time to live. It must be expressed in seconds and the default value is `604 800` (7 days) |
| `OBJECT_SPEC_FILTER` | A filter used to select only latest data objects containing this pattern. The default value is `radon data`, could be eg `CO data`, `CO2 data`, `CH4 data` |
| `OBJECT_VARIABLE` | The name of the variable contained in the corresponding data objects. The default value is `rn`, could be eg `co`, `co2`, `ch4` |
| `HISTORY` | The duration of the observations data history the job has to download. It must be expressed in seconds and the default value is `86 400 000` (1 day) |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

## Deployment

We personally use [Kargo](https://kalisio.github.io/kargo/) to deploy the service.

