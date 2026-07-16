---
title: krawler-awc
description: Job scraping METAR and TAF data from the Aviation Weather Center.
---

# krawler-awc

_Job scraping METAR and TAF data from the Aviation Weather Center._

## Overview

The **krawler-awc** jobs allow to scrape data using the [api](https://aviationweather.gov/data/api/) provided by the **Aviation Weather Center**.

The downloaded data are stored within a [MongoDB](https://www.mongodb.com/) database and more precisely in 3 collections:
* `awc-metars` that stores the **METAR** data
* `awc-tafs` that stores the **TAF** data
* `awc-stations` that stores the stations data

All records are stored in [GeoJson](https://fr.wikipedia.org/wiki/GeoJSON) format.

The job is executed according a specific cron expression. By default, every hours.

## Implementation

As far as possible, jobs use the [cache files](https://aviationweather.gov/data/api/#cache).

## Configuration

### Stations

| Variable | Description                                                                                   |
|----------|-----------------------------------------------------------------------------------------------|
| `DB_URL` | The mongoDB database URL. The default value is `mongodb://127.0.0.1:27017/awc`                |
| `DEBUG`  | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

### metars-tafs

| Variable | Description                                                                                         |
|----------|-----------------------------------------------------------------------------------------------------|
| `DATA`   | The type of weather dataset to process (metars, tafs). The default value is `metars`.               |
| `DB_URL` | The mongoDB database URL. The default value is `mongodb://127.0.0.1:27017/awc`                      |
| `TTL`    | The data time to live. It must be expressed in seconds and the default value is `2592000` (30 days) |
| `DEBUG`  | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined.       |
