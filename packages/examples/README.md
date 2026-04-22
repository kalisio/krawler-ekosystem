# @kalisio/krawler-examples

_A collection of [krawler](https://github.com/kalisio/krawler-ekosystem/tree/main/packages/krawler) job examples._

This package bundles several ready-to-run examples demonstrating how to build ETL jobs with krawler.

## Examples

| Example | Description |
| --- | --- |
| [adsb](./adsb) | Track ADS-B flight data |
| [aeroway](./aeroway) | Aeroway data processing |
| [airports](./airports) | Process airport data from JSON/XML sources |
| [bdtopo](./bdtopo) | French IGN BD TOPO data |
| [csv2db](./csv2db) | Push CSV rows into MongoDB or PostgreSQL |
| [dem2csv](./dem2csv) | Convert digital elevation model (DEM) to CSV |
| [docker](./docker) | Orchestrate containerised jobs |
| [extend](./extend) | Extend krawler with custom hooks/tasks |
| [wms2yaml](./wms2yaml) | Generate mapproxy YAML from WMS capabilities |

## Running an example

Each example ships with a `jobfile.js`. Use the `krawler` CLI:

```bash
pnpm example:adsb
# or directly
pnpm exec krawler adsb/jobfile.js
```

## License

Licensed under the [MIT license](../../LICENSE.md).
