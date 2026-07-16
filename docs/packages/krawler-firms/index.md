---
title: krawler-firms
description: A Krawler based service to download data from the Fire Information for Resource Management System (FIRMS)
---

# krawler-firms

_A Krawler based service to download data from the Fire Information for Resource Management System (FIRMS)_

## Overview

The **krawler-firms** job allows to scrape data from the FIRMS using the following url: [https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_7d.csv](https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_7d.csv). The downloaded data are stored within a [MongoDB](https://www.mongodb.com/) database:
* the `firms` collection stores the Thermal Hotspots and Fire Activity data

All records are stored in [GeoJson](https://fr.wikipedia.org/wiki/GeoJSON) format.

The job is executed according a specific cron expression. By default, every hour.

## Configuration

| Variable | Description                                                                                   |
|----------|-----------------------------------------------------------------------------------------------|
| `DB_URL` | The mongoDB database URL. The default value is `mongodb://127.0.0.1:27017/kano`               |
| `DEBUG`  | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |
