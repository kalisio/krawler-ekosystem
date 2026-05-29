---
title: krawler-teleray
description: A Krawler based job to download data from the French gamma dose rate alert Teleray network.
---

# krawler-teleray

_A Krawler based job to download data from the French gamma dose rate alert [Teleray](https://doc.teleray.asnr.fr/documentation/api/api-teleray.html) network._

## Overview

The **krawler-teleray** job scrapes gamma dose rate measurements from the following url: [https://api.teleray.asnr.fr/wfs/collections/measures/items](https://api.teleray.asnr.fr/wfs/collections/measures/items). The downloaded data are stored within a [MongoDB](https://www.mongodb.com/) database and more precisely in 2 collections:
* the `teleray-measures` collection stores the measurement data
* the `teleray-stations` collection stores the station positions

All records are stored in [GeoJson](https://fr.wikipedia.org/wiki/GeoJSON) format.

The job is executed according a specific cron expression. By default, every 10 minutes.

## Configuration

| Variable | Description |
|--- | --- |
| `DB_URL` | The mongoDB database URL. The default value is `mongodb://127.0.0.1:27017/k-teleray` |
| `STATIONS_COLLECTION` | The name of the MongoDB collection for stations positions. The default value is `teleray-stations` |
| `MEASURES_COLLECTION` | The name of the MongoDB collection for measures data. The default value is `teleray-measures` |
| `TTL` | The observations data time to live. It must be expressed in seconds and the default value is `604 800` (7 days) |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

## Deployment

We personally use [Kargo](https://kalisio.github.io/kargo/) to deploy the service.
