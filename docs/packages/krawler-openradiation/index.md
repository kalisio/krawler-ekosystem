---
title: krawler-openradiation
description: A Krawler based service to download data from the OpenRadiation project.
---

# krawler-openradiation

_A Krawler based service to download data from the OpenRadiation project._

## Overview

The **krawler-openradiation** job scrapes measurements from the [OpenRadiation API](https://github.com/openradiation/openradiation-api). The downloaded data are stored within a [MongoDB](https://www.mongodb.com/) database and more precisely in a collection named `openradiation`.

All records are stored in [GeoJson](https://fr.wikipedia.org/wiki/GeoJSON) format.

The job is executed according a specific cron expression. By default, every hour.

## Configuration

| Variable | Description |
|--- | --- |
| `KEY` | The key to use the API. As mentioned [here](https://www.openradiation.org/en/developers), you should ask this access code to the **OpenRadiation** team. |
| `DB_URL` | The mongoDB database URL. The default value is `mongodb://127.0.0.1:27017/openradiation` |
| `COLLECTION` | The mongoDB database collection. The default value is `openradiation` |
| `DATE_OF_CREATION` | Force the date of measurements to be retrieved. Undefined by default so that the current date will be used. |
| `TTL` | The measurements data time to live. It must be expressed in seconds and the default value is `604 800` (7 days) |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

## Deployment

We personally use [Kargo](https://kalisio.github.io/kargo/) to deploy the service.


