---
title: krawler-meteofrance
description: A Krawler job designed to scrape data from the Météo-France public API
---

# krawler-meteofrance

_A Krawler job designed to scrape data from the Météo-France public API_

## Overview

A [Krawler](https://kalisio.github.io/krawler/) based service to download diverse datasets from the public [Météo-France API portal](https://portail-api.meteofrance.fr/web/fr/).

## paquetobs

The **paquetobs** job files enable the scraping of [real-time observations](https://donneespubliques.meteofrance.fr/?fond=produit&id_produit=93&id_rubrique=32) from all weather stations of the French network at hourly and/or sub-hourly intervals (every 6 minutes). These data are exposed by the public API [Package Observations](https://portail-api.meteofrance.fr/web/fr/api/DonneesPubliquesPaquetObservation).

### paquetobs-stations

This job scrapes the stations. The main collected properties are:
* **id**, the id of the station
* **name**, the name of the station
* **location**, the location of the station

The station data are stored in compliance with the **GeoJSON** standard.

#### Configuration

| Variable | Description |
|--- | --- |
| `PAQUETOBS_TOKEN` | The token to use the **paquetobs** API |
| `DEPARTMENTS` | The list of departments used to filter the collected observations, e.g, `"11,09,31"` |
| `STATIONS` | The list of station ids used to filter the collected observations, e.g, `"09099001,09301001"` |
| `DB_URL` | the database url. By default: `mongodb://localhost:27017/meteofrance`. |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

### paquetobs-observations

This job scrapes the observations. The basic collected properties are:
* **id**, the id of the station
* **name**, the name of the station
* **temperature** (°),
* **humidity** (%),
* **wind direction** (°),
* **wind speed** (m/s),
* **precipitation** (mm/h)

The observation data are stored in compliance with the **GeoJSON** standard.

#### Configuration

| Variable | Description |
|--- | --- |
| `PAQUETOBS_TOKEN` | The **paquetobs** API token. |
| `FREQUENCY` | The frequency of the observations to collect. It must be `horaire` or `infrahoraire-6m`. Default value is `horaire`. |
| `LATENCY` | The latency of the observations to collect. It must be `horaire` or `infrahoraire-6m`. Default value is `horaire`. |
| `TTL` | The retention period in seconds of the data. By default: `7 * 24 * 60 * 60` (~7 days) |
| `DB_URL` | the database url. By default: `mongodb://localhost:27017/meteofrance`. |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

## Forecast Pipeline (AROME / ARPEGE)

![forecast-pipeline](./forecast-pipeline.svg)

These jobs download forecast data from the public Météo-France API:

* **[AROME](https://portail-api.meteofrance.fr/web/fr/api/PaquetAROME)** – High-resolution regional model
* **[ARPEGE](https://portail-api.meteofrance.fr/web/fr/api/PaquetARPEGE)** – Global model

Files are retrieved in **GRIB2** format.

### Available Jobs

| Job | Type | Resolution | Coverage |
|---|---|---|---|
| `arome-france` | AROME | 0.025° | France |
| `arome-france-high` | AROME | 0.01° | France |
| `arpege-europe` | ARPEGE | 0.1° | Europe |
| `arpege-world` | ARPEGE | 0.25° | Global |

### Configuration

| Variable | Description |
|----------|----------|
| `DATA_SOURCE` | Source of the data (`meteofrance` or `data-gouv`) |
| `AROME_TOKEN` | API token for AROME |
| `ARPEGE_TOKEN` | API token for ARPEGE |
| `OUTPUT_DIR` | Base directory for downloaded files |
| `WORKERS_LIMIT` | Maximum number of concurrent downloads |
| `OLDEST_RUN_INTERVAL_MS` | Max allowed run age |
| `RUN_TIMES` | Override model run times |
| `PACKAGES` | Override packages |
| `FORECAST_TIMES` | Override forecast steps |

## Deployment

We personally use [Kargo](https://kalisio.github.io/kargo/) to deploy the service.


