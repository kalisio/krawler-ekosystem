---
title: krawler-meteoradar
description: A Krawler based service to download public Rainfall Radar data from MeteoFrance.
---

# krawler-meteoradar

_A Krawler based service to download public [Rainfall Radar data from MeteoFrance](https://donneespubliques.meteofrance.fr/?fond=produit&id_produit=98&id_rubrique=34)._

## Overview

The **krawler-meteoradar** job scrapes public Radar rainfall data from Meteo France public server. The downloaded images are stored in PNG format without any georeference information.
The job first georeferenced the image and then converts it to [COG format](https://www.cogeo.org/) and copies it to a store.

The major part of the process is done using [GDAL](https://gdal.org/index.html).

The job scrapes the data according a specific cron expression. By default every 15 minutes.

## Configuration

| Variable | Description |
|--- | --- |
| `STORE_PATH` | The path where to store the files |
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

Setting the **STORE_PATH** environment variable triggers files copy to a predefined store using [Rclone](https://rclone.org/).
It is then required to define the remote store using [Rclone environment variables](https://rclone.org/docs/#environment-variables).

## Deployment

We personally use [Kargo](https://kalisio.github.io/kargo/) to deploy the service.
