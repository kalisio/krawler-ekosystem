# krawler-kollectivite

A collections of of [Krawler](https://kalisio.github.io/krawler/) based jobs to get data from public API and OSM in france. From INSEE code and/or SIREN codes of intercommunity.
Will output files in output, in a format that you can import as a layer in Kano.

## Uses

### exemple of codes

INSEE codes:
- 31555: Toulouse
- 30007: Alès
- 33063: Bordeaux
- 33243: Libourne

SIREN codes of interco:
- 244701355: Communauté de communes des Coteaux et Landes de Gascogne
- 200096956: Agen
- 200033081: Toulouse

Set the values like :
export INSEE_CODES=31555,30007
export SIREN_CODES=200096956,244701355

## installation

1. Krawler must be installed and available in the PATH (/home/$USER/.yarn/bin/krawler)
2. Install the project dependencies with `pnpm install` from the monorepo root
3. Run the job with `NODE_ENV=development krawler <jobfile>` from this package directory

## jobs

### georisque

Use the georisques.gouv.fr/api api.

output to output/georisque_output:
- icpe.json
- seveso.json

### Landcover

Get land area data from geoplateforme LANDCOVER.

uses Overpass to get the bounds of an area.

Uses CLC_CODES
- 111 code for "Urban fabric" in Corine Land Cover 2018
- 112 code for "Industrial or commercial units"
- 121 code for "Arable land"

output to output/landcover_output:
Will have a file per code, like landcover-111.json, 
landcover-112.json ... landcover-313.json

### Osm

Use an instance of overpass to get data.

the task to get from OSM are defined in osm-tasks.js. Like here for town hall:
```
export default {
    "Mairie": {
        "nwrs": [[{
            "amenity": "townhall"
        }]],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#cc99ff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-landmark",
                            "size": 28,
                            "color": "#000000",
                            "opacity": 1
                        }
                    }
                },
                "cluster": {
                    "disableClusteringAtZoom": 3
                },
                "infobox": {
                    "pick": [
                        "id"
                    ]
                },
                "popup": false,
                "tooltip": false
            }
        }
    },
}

```

This will output to output/osm_output:
The exemple task will output a json to `output/osm_output/Mairie.json`
