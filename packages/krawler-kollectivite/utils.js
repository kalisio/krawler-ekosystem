const INSEE_CODES = process.env.INSEE_CODES?.split(',') || ['31555', '30007', '33063', '33243', '33179'];
const SIREN_CODES = process.env.SIREN_CODES?.split(',') || ['243100518',];

export async function getInseeCodesForSiren(siren) {
    const response = await fetch(`https://geo.api.gouv.fr/epcis/${siren}/communes`);
    const data = await response.json();
    return data.map(commune => commune.code);
}

export async function getInseeCodesForSirenAdminExpress(siren) {
  const url = `https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:epci&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&CQL_FILTER=code_siren=${siren}&propertyName=codes_insee_des_communes_membres`;

  const response = await fetch(url);

  const data = await response.json();
  if (!data.features?.length) {
    return [];
  }

  // The codes INSEE in in a string separated by "/"
  const rawCodes = data.features[0].properties.codes_insee_des_communes_membres;
  return rawCodes.split("/");
}

export const fetchInseeCodes = () => {
    return async (hook) => {
        let inseeCodes = [...INSEE_CODES]

        if (SIREN_CODES.length > 0) {
            const sirenInseeCodes = []
            for (const siren of SIREN_CODES) {
                try {
                    const codes = await getInseeCodesForSirenAdminExpress(siren)
                    sirenInseeCodes.push(...codes)
                } catch (error) {
                }
            }
            inseeCodes = [...new Set([...INSEE_CODES, ...sirenInseeCodes])]
        }

        hook.data.inseeCodes = inseeCodes
        return hook
    }
}