export default {
    "Archives départementales": {
        typename: "BDTOPO_V3:zone_d_activite_ou_d_interet",
        filter : {
            "nature_detaillee": "Archives départementales"
        },
        out: "center",
        properties: {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#ffffff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-archive",
                            "size": 28,
                            "color": "black",
                            "opacity": 1
                        }
                    }
                },
           "cluster": {
                "disableClusteringAtZoom": 3
            },
            "popup": false,
            "tooltip": false
         }
       }
    },

    "Siège des EPCI": {
        typename: "BDTOPO_V3:zone_d_activite_ou_d_interet",
        Projection: "EPSG:2154",
        filter: {
            nature: "Siège d'EPCI"
        },
        out: "center",
        properties: {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#cc99ff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-sitemap",
                            "size": 28,
                            "color": "#000000",
                            "opacity": 1
                        }
                    }
                },
            "cluster": {
                "disableClusteringAtZoom": 3
            },
            "popup": false,
            "tooltip": false
        }
      }
    },

    "Etablissement pour personnes handicapées": {
        typename: "BDTOPO_V3:zone_d_activite_ou_d_interet",
        Projection: "EPSG:2154",
        filter: {
            nature: "Structure d'accueil pour personnes handicapées"
        },
        out: "center",
        properties: {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "triangle-down",
                        "color": "#ff6666",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-wheelchair",
                            "size": 23,
                            "color": "black",
                            "opacity": 1
                        }
                    }
                },
            "cluster": {
                "disableClusteringAtZoom": 3
            },
            "popup": false,
            "tooltip": false
         }
       }
    },

    "ERP": {
        typename: "BDTOPO_V3:erp",
        Projection: "EPSG:2154",
        filter: {},
        properties: {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#ffffff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-store-alt",
                            "size": 28,
                            "color": "black",
                            "opacity": 1
                        }
                    }
                },
            "cluster": {
                "disableClusteringAtZoom": 3
            },
            "popup": false,
            "tooltip": false
        }
      }
    },

    "Château d'eau": {
        typename: "BDTOPO_V3:reservoir",
        Projection: "EPSG:2154",
        filter: {
            nature: "Château d'eau"
        },
        out: "center",
        properties: {}
    },

    "Déchèterie": {
        typename: "BDTOPO_V3:zone_d_activite_ou_d_interet",
        Projection: "EPSG:2154",
        filter: {
            nature: "Déchèterie"
        },
        out: "center",
        properties: {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "square-pin",
                        "color": "#ffff66",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-trash",
                            "size": 26,
                            "color": "black",
                            "opacity": 1
                        }
                    }
                },
            "cluster": {
                "disableClusteringAtZoom": 3
            },
            "popup": false,
            "tooltip": false
          }
       }
    }
}
