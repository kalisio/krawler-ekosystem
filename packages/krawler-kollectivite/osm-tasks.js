export default {
    "Mairie": {
        "nwrs": [
            [
                {
                    "amenity": "townhall"
                }
            ]
        ],
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
                "popup": false,
                "tooltip": false
            }
        }
    },
    "Conseil Départemental": {
        "nwrs": [
            [
                {
                    "name": "Conseil Départemental"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#ffffff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-university",
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
    "Préfecture": {
        "nwrs": [
            [
                {
                    "government": "prefecture"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "star",
                        "color": "#cc99ff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-landmark",
                            "size": 20,
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
    "Force de Sécurité Intérieur (FSI)": {
        "nwrs": [
            [
                {
                    "amenity": "police"
                }
            ]
        ],
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
                            "classes": "las la-taxi",
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
    "Pompiers": {
        "nwrs": [
            [
                {
                    "amenity": "fire_station"
                }
            ]
        ],
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
                            "classes": "las la-burn",
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
    "Site militaire": {
        "nwrs": [
            [
                {
                    "landuse": "military"
                }
            ]
        ],
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
                            "classes": "las la-eye-slash",
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
    "Etablissements Hospitalier et de Soins": {
        "nwrs": [
            [
                {
                    "healthcare": "yes"
                }
            ],
            [
                {
                    "amenity": [
                        "hospital",
                        "clinic"
                    ]
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "triangle-down",
                        "color": "#ff6666",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-heartbeat",
                            "size": 23,
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
    "Etablissements pour personnes âgées": {
        "nwrs": [
            [
                {
                    "social_facility:for": "senior"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "triangle-down",
                        "color": "#ff6666",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-blind",
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
    "Ecole": {
        "nwrs": [
            [
                {
                    "amenity": "school"
                }
            ],
            [
                {
                    "amenity": [
                        "college",
                        "training",
                        "university"
                    ]
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "triangle-down",
                        "color": "#ff6666",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-graduation-cap",
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
    "Camping": {
        "nwrs": [
            [
                {
                    "tourism": "camp_site"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "triangle-down",
                        "color": "#ff6666",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-campground",
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
    "Aires des gens du voyage": {
        "nwrs": [
            [
                {
                    "residential": "halting_site"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "triangle-down",
                        "color": "#ff6666",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-shuttle-van",
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
    "Gymnase": {
        "nwrs": [
            [
                {
                    "building": "sports_hall"
                }
            ],
            [
                {
                    "leisure": "sports_hall"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "triangle",
                        "color": "#99ff99",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-warehouse",
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
    "Salle": {
        "nwrs": [
            [
                {
                    "amenity": "community_centre"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "triangle",
                        "color": "#99ff99",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-home",
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
    "Lieu de culte": {
        "nwrs": [
            [
                {
                    "amenity": "place_of_worship"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#ffffff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-place-of-worship",
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
    "Magasin de bricolage": {
        "nwrs": [
            [
                {
                    "shop": "doityourself"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#ffffff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-tools",
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
    "Magasin de vente alimentaire": {
        "nwrs": [
            [
                {
                    "shop": [
                        "mail",
                        "supermarket",
                        "bakery",
                        "butcher",
                        "cheese",
                        "convenience",
                        "farm",
                        "frozen_food",
                        "greengrocer",
                        "pastry",
                        "seafood"
                    ]
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#ffffff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-apple-alt",
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
    "Restaurant": {
        "nwrs": [
            [
                {
                    "amenity": [
                        "restaurant",
                        "fast_food",
                        "food_court"
                    ]
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#ffffff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-utensils",
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
    "Arrêt de bus": {
        "nwrs": [
            [
                {
                    "highway": "bus_stop"
                }
            ]
        ],
        "out": "center",
        "properties": {
            "leaflet": {
                "style": {
                    "point": {
                        "shape": "circle",
                        "color": "#ffffff",
                        "opacity": 1,
                        "stroke": null,
                        "size": 40,
                        "icon": {
                            "classes": "las la-bus-alt",
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
    "Autoroute": {
        "ways": [
            [
                {
                    "highway": [
                        "motorway",
                        "trunk",
                        "motorway_link",
                        "trunk_link"
                    ]
                }
            ]
        ],
        "out": "geom",
        "properties": {
            "leaflet": {
                "style": {},
                "cluster": {
                    "disableClusteringAtZoom": 3
                },
                "popup": false,
                "tooltip": false
            }
        }
    },
        "Route principale": {
        "ways": [
             [
                {
                    "highway": [
                        "primary",
                        "primary_link"
                    ]
                }
            ]
        ],
        "out": "geom",
        "properties": {
            "leaflet": {
                "style": {},
                "cluster": {
                    "disableClusteringAtZoom": 3
                },
                "popup": false,
                "tooltip": false
            }
        }
    },
     "Route secondaire et tertiaire": {
        "ways": [
            [
                {
                    "highway": [
                        "secondary",
                        "tertiary",
                        "secondary_link",
                        "tertiary_link",
                        "residential"
                    ]
                }
            ]
        ],
        "out": "geom",
        "properties": {
            "leaflet": {
                "style": {},
                "cluster": {
                    "disableClusteringAtZoom": 3
                },
                "popup": false,
                "tooltip": false
            }
        }
    },
    "Voies de chemin de fer": {
        "ways": [
            [
                {
                    "railway": "rail"
                }
            ]
        ],
        "out": "geom",
        "properties": {
            "leaflet": {
                "style": {},
                "cluster": {
                    "disableClusteringAtZoom": 3
                },
                "popup": false,
                "tooltip": false
            }
        }
    }
};
