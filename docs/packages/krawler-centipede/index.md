---
title: krawler-centipede
description: A Krawler based service to get the antennas status of the RTK Centipede Network
---

# krawler-centipede

_A Krawler based service to get the antennas status of the RTK Centipede Network_

## Overview

The **krawler-centipede** job allow to scrape antennas status from the [centipede RTK server](https://centipede.fr/). The downloaded data are stored within a [MongoDB](https://www.mongodb.com/) database and more precisely in 2 collections:
* the `bases` collection stores the data relative to the bases
* the `pings` collection stores the ping status of each base


All records are stored in [GeoJson](https://fr.wikipedia.org/wiki/GeoJSON) format.

The job is executed according a specific cron expression. By default, every 5 minutes.

## Configuration

| Variable | Description                                                                                                     |
|----------|-----------------------------------------------------------------------------------------------------------------|
| `DB_URL` | The mongoDB database URL. The default value is `mongodb://127.0.0.1:27017/centipede`                            |
| `TTL`    | The measurements data time to live. It must be expressed in seconds and the default value is `604 800` (7 days) |
| `DEBUG`  | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined.                   |
