/* tools/build_site.py tarafından üretilir — elle düzenlemeyin. */
export const CATALOG = {
  "manifestVersion": "c0ba2511f2",
  "allowedModelPrefixes": [
    "a_b_blok/",
    "c_blok/",
    "d_blok/",
    "e_blok/",
    "f_blok/",
    "fabrika/",
    "ilahiyat/",
    "kutuphane/",
    "oku_genel_plan/",
    "rektorluk/"
  ],
  "map": {
    "width": 1332,
    "height": 1395,
    "avif": "assets/map/campus-plan.avif?v=8eac8fb9a7",
    "webp": "assets/map/campus-plan.webp?v=2b4e47912e"
  },
  "models": [
    {
      "id": "a_b_blok",
      "title": "A-B Blok",
      "label": "A‑B Blok",
      "emoji": "🏢",
      "model": "a_b_blok/a_b_blok/A blok B blok Spor Tesisleri.geometry-lod/low.glb",
      "fallback": "a_b_blok/a_b_blok/A blok B blok Spor Tesisleri.gltf",
      "geometryLod": "a_b_blok/a_b_blok/A blok B blok Spor Tesisleri.geometry-lod.json",
      "type": "Eğitim ve spor kompleksi",
      "description": "A ve B blokları ile spor tesislerini birlikte inceleyin.",
      "campusZone": "Karacaoğlan Yerleşkesi",
      "category": "egitim",
      "poster": "assets/posters/a_b_blok.webp?v=f310167007",
      "sizeBytes": 3312340,
      "fallbackSizeBytes": 126977157,
      "tiers": [
        {
          "id": "low",
          "bytes": 3312340,
          "triangles": 196088
        },
        {
          "id": "medium",
          "bytes": 11467492,
          "triangles": 747316
        },
        {
          "id": "high",
          "bytes": 39155200,
          "triangles": 2491704
        }
      ],
      "geo": {
        "lat": 37.042659,
        "lng": 36.223386
      },
      "map": {
        "x": 0.682,
        "y": 0.241,
        "confirmed": true
      },
      "sources": [
        {
          "label": "OKÜ — Ne Nerede? (yerleşke rehberi)",
          "url": "https://www.osmaniye.edu.tr/ne-nerede"
        }
      ],
      "keywords": [
        "A B Blok",
        "Spor Tesisleri"
      ],
      "i18n": {
        "en": {
          "title": "Blocks A–B",
          "label": "Blocks A–B",
          "campusZone": "Karacaoğlan Campus",
          "type": "Teaching and sports complex",
          "description": "Explore Blocks A and B together with the sports facilities.",
          "keywords": [
            "Block A",
            "Block B",
            "Sports facilities"
          ],
          "sources": [
            "OKÜ — “Ne Nerede?” campus guide"
          ]
        }
      }
    },
    {
      "id": "c_blok",
      "title": "C Blok",
      "label": "C Blok",
      "emoji": "🏢",
      "model": "c_blok/c_blok/C Blok lab.geometry-lod/low.glb",
      "fallback": "c_blok/c_blok/C Blok lab.gltf",
      "geometryLod": "c_blok/c_blok/C Blok lab.geometry-lod.json",
      "type": "Eğitim ve laboratuvar bloğu",
      "description": "C Blok laboratuvar yapısını ayrıntılı 3B model üzerinden keşfedin.",
      "campusZone": "Karacaoğlan Yerleşkesi",
      "category": "egitim",
      "poster": "assets/posters/c_blok.webp?v=eae20afb11",
      "sizeBytes": 1124768,
      "fallbackSizeBytes": 101014675,
      "tiers": [
        {
          "id": "low",
          "bytes": 1124768,
          "triangles": 59648
        },
        {
          "id": "medium",
          "bytes": 3972484,
          "triangles": 230685
        },
        {
          "id": "high",
          "bytes": 38806984,
          "triangles": 769204
        }
      ],
      "map": {
        "x": 0.4917,
        "y": 0.4114,
        "confirmed": true
      },
      "keywords": [
        "Laboratuvar",
        "Lab"
      ],
      "i18n": {
        "en": {
          "title": "Block C",
          "label": "Block C",
          "campusZone": "Karacaoğlan Campus",
          "type": "Teaching and laboratory block",
          "description": "Explore the Block C laboratory building through a detailed 3D model.",
          "keywords": [
            "Laboratory",
            "Lab"
          ]
        }
      }
    },
    {
      "id": "d_blok",
      "title": "D Blok",
      "label": "D Blok",
      "emoji": "🏢",
      "model": "d_blok/d_blok/D Blok .geometry-lod/low.glb",
      "fallback": "d_blok/d_blok/D Blok .gltf",
      "geometryLod": "d_blok/d_blok/D Blok .geometry-lod.json",
      "type": "Eğitim bloğu",
      "description": "D Blok yapısını farklı açılardan inceleyin.",
      "campusZone": "Karacaoğlan Yerleşkesi",
      "category": "egitim",
      "poster": "assets/posters/d_blok.webp?v=14313821c8",
      "sizeBytes": 977020,
      "fallbackSizeBytes": 72195247,
      "tiers": [
        {
          "id": "low",
          "bytes": 977020,
          "triangles": 63493
        },
        {
          "id": "medium",
          "bytes": 3373340,
          "triangles": 240901
        },
        {
          "id": "high",
          "bytes": 28041896,
          "triangles": 803154
        }
      ],
      "map": {
        "x": 0.4333,
        "y": 0.5318,
        "confirmed": true
      },
      "i18n": {
        "en": {
          "title": "Block D",
          "label": "Block D",
          "campusZone": "Karacaoğlan Campus",
          "type": "Teaching block",
          "description": "Examine Block D from every angle."
        }
      }
    },
    {
      "id": "e_blok",
      "title": "E Blok",
      "label": "E Blok",
      "emoji": "🏢",
      "model": "e_blok/e_blok/E Blok.geometry-lod/low.glb",
      "fallback": "e_blok/e_blok/E Blok.gltf",
      "geometryLod": "e_blok/e_blok/E Blok.geometry-lod.json",
      "type": "Eğitim bloğu",
      "description": "E Blok yapısını farklı açılardan inceleyin.",
      "campusZone": "Karacaoğlan Yerleşkesi",
      "category": "egitim",
      "poster": "assets/posters/e_blok.webp?v=9af5983415",
      "sizeBytes": 1254064,
      "fallbackSizeBytes": 110516403,
      "tiers": [
        {
          "id": "low",
          "bytes": 1254064,
          "triangles": 76775
        },
        {
          "id": "medium",
          "bytes": 4450504,
          "triangles": 295557
        },
        {
          "id": "high",
          "bytes": 42999320,
          "triangles": 985319
        }
      ],
      "map": {
        "x": 0.755,
        "y": 0.841,
        "confirmed": true
      },
      "i18n": {
        "en": {
          "title": "Block E",
          "label": "Block E",
          "campusZone": "Karacaoğlan Campus",
          "type": "Teaching block",
          "description": "Examine Block E from every angle."
        }
      }
    },
    {
      "id": "f_blok",
      "title": "F Blok",
      "label": "F Blok",
      "emoji": "🏢",
      "model": "f_blok/f_blok/F Blok.geometry-lod/low.glb",
      "fallback": "f_blok/f_blok/F Blok.gltf",
      "geometryLod": "f_blok/f_blok/F Blok.geometry-lod.json",
      "type": "Eğitim bloğu",
      "description": "F Blok yapısını farklı açılardan inceleyin.",
      "campusZone": "Karacaoğlan Yerleşkesi",
      "category": "egitim",
      "poster": "assets/posters/f_blok.webp?v=8c04663a40",
      "sizeBytes": 1166860,
      "fallbackSizeBytes": 103220202,
      "tiers": [
        {
          "id": "low",
          "bytes": 1166860,
          "triangles": 52213
        },
        {
          "id": "medium",
          "bytes": 4095488,
          "triangles": 196142
        },
        {
          "id": "high",
          "bytes": 42999712,
          "triangles": 653983
        }
      ],
      "map": {
        "x": 0.798,
        "y": 0.702,
        "confirmed": true
      },
      "i18n": {
        "en": {
          "title": "Block F",
          "label": "Block F",
          "campusZone": "Karacaoğlan Campus",
          "type": "Teaching block",
          "description": "Examine Block F from every angle."
        }
      }
    },
    {
      "id": "fabrika",
      "title": "Fabrika Yerleşkesi",
      "label": "Fabrika Yerleşkesi",
      "emoji": "🏭",
      "model": "fabrika/fabrika_yerleskesi.geometry-lod/low.glb",
      "fallback": "fabrika/fabrika_yerleskesi.gltf",
      "geometryLod": "fabrika/fabrika_yerleskesi.geometry-lod.json",
      "type": "Uygulama yerleşkesi",
      "description": "Fabrika yerleşkesinin yapı ve çevre düzenini birlikte görün.",
      "category": "uygulama",
      "poster": "assets/posters/fabrika.webp?v=47beb1b25d",
      "sizeBytes": 755576,
      "fallbackSizeBytes": 25643934,
      "tiers": [
        {
          "id": "low",
          "bytes": 755576,
          "triangles": 87460
        },
        {
          "id": "medium",
          "bytes": 1327948,
          "triangles": 159536
        },
        {
          "id": "high",
          "bytes": 16811516,
          "triangles": 531864
        }
      ],
      "keywords": [
        "Fabrika",
        "Yerleşke",
        "Kampüs"
      ],
      "i18n": {
        "en": {
          "title": "Factory Campus",
          "label": "Factory Campus",
          "type": "Applied campus",
          "description": "See the buildings and grounds of the Factory Campus together.",
          "keywords": [
            "Factory",
            "Campus"
          ]
        }
      }
    },
    {
      "id": "ilahiyat",
      "title": "İlahiyat",
      "label": "İlahiyat",
      "emoji": "🎓",
      "model": "ilahiyat/ilahiyat/ilahiyat.geometry-lod/low.glb",
      "fallback": "ilahiyat/ilahiyat/ilahiyat.gltf",
      "geometryLod": "ilahiyat/ilahiyat/ilahiyat.geometry-lod.json",
      "type": "Fakülte binası",
      "description": "İlahiyat Fakültesi binasını 3B olarak inceleyin.",
      "officialName": "İlahiyat Fakültesi",
      "campusZone": "Karacaoğlan Yerleşkesi",
      "category": "egitim",
      "poster": "assets/posters/ilahiyat.webp?v=610d31a6a9",
      "sizeBytes": 710744,
      "fallbackSizeBytes": 65148455,
      "tiers": [
        {
          "id": "low",
          "bytes": 710744,
          "triangles": 50746
        },
        {
          "id": "medium",
          "bytes": 2575344,
          "triangles": 194735
        },
        {
          "id": "high",
          "bytes": 23418056,
          "triangles": 649179
        }
      ],
      "geo": {
        "lat": 37.038718,
        "lng": 36.219442
      },
      "units": [
        {
          "name": "Temel İslam Bilimleri Bölümü",
          "url": "https://www.osmaniye.edu.tr/ilahiyat"
        },
        {
          "name": "Felsefe ve Din Bilimleri Bölümü",
          "url": "https://www.osmaniye.edu.tr/ilahiyat"
        },
        {
          "name": "İslam Tarihi ve Sanatları Bölümü",
          "url": "https://www.osmaniye.edu.tr/ilahiyat"
        }
      ],
      "map": {
        "x": 0.3155,
        "y": 0.8261,
        "confirmed": true
      },
      "sources": [
        {
          "label": "OKÜ — İlahiyat Fakültesi",
          "url": "https://www.osmaniye.edu.tr/ilahiyat"
        },
        {
          "label": "OKÜ — Ne Nerede? (yerleşke rehberi)",
          "url": "https://www.osmaniye.edu.tr/ne-nerede"
        }
      ],
      "keywords": [
        "İlahiyat Fakültesi",
        "Fakülte"
      ],
      "i18n": {
        "en": {
          "title": "Theology",
          "label": "Theology",
          "officialName": "Faculty of Theology",
          "campusZone": "Karacaoğlan Campus",
          "type": "Faculty building",
          "description": "Explore the Faculty of Theology building in 3D.",
          "keywords": [
            "Faculty of Theology",
            "Faculty",
            "Divinity"
          ],
          "units": [
            "Department of Basic Islamic Sciences",
            "Department of Philosophy and Religious Studies",
            "Department of Islamic History and Arts"
          ],
          "sources": [
            "OKÜ — Faculty of Theology",
            "OKÜ — “Ne Nerede?” campus guide"
          ]
        }
      }
    },
    {
      "id": "kutuphane",
      "title": "Kütüphane",
      "label": "Kütüphane",
      "emoji": "📚",
      "model": "kutuphane/kutuphane/Kutuphane.geometry-lod/low.glb",
      "fallback": "kutuphane/kutuphane/Kutuphane.gltf",
      "geometryLod": "kutuphane/kutuphane/Kutuphane.geometry-lod.json",
      "type": "Kütüphane",
      "description": "Merkez kütüphane binasını farklı açılardan keşfedin.",
      "officialName": "Kütüphane Binası",
      "campusZone": "Karacaoğlan Yerleşkesi",
      "category": "sosyal",
      "poster": "assets/posters/kutuphane.webp?v=3c17c0d5ac",
      "sizeBytes": 1525428,
      "fallbackSizeBytes": 52974105,
      "tiers": [
        {
          "id": "low",
          "bytes": 1525428,
          "triangles": 76069
        },
        {
          "id": "medium",
          "bytes": 5427812,
          "triangles": 292819
        },
        {
          "id": "high",
          "bytes": 18661756,
          "triangles": 976200
        }
      ],
      "geo": {
        "lat": 37.039673,
        "lng": 36.221153
      },
      "units": [
        {
          "name": "Kütüphane ve Dokümantasyon Daire Başkanlığı",
          "url": "https://www.osmaniye.edu.tr/kutuphane"
        }
      ],
      "map": {
        "x": 0.4821,
        "y": 0.6932,
        "confirmed": true
      },
      "sources": [
        {
          "label": "OKÜ — Kütüphane ve Dokümantasyon Daire Başkanlığı",
          "url": "https://www.osmaniye.edu.tr/kutuphane"
        },
        {
          "label": "OKÜ — Ne Nerede? (yerleşke rehberi)",
          "url": "https://www.osmaniye.edu.tr/ne-nerede"
        }
      ],
      "keywords": [
        "Kütüphane",
        "Library"
      ],
      "i18n": {
        "en": {
          "title": "Library",
          "label": "Library",
          "officialName": "Library Building",
          "campusZone": "Karacaoğlan Campus",
          "type": "Library",
          "description": "Explore the main library building from every angle.",
          "keywords": [
            "Library"
          ],
          "units": [
            "Department of Library and Documentation"
          ],
          "sources": [
            "OKÜ — Department of Library and Documentation",
            "OKÜ — “Ne Nerede?” campus guide"
          ]
        }
      }
    },
    {
      "id": "oku_genel_plan",
      "title": "OKÜ Yerleşke Genel Plan",
      "label": "OKÜ Yerleşke Genel Plan",
      "emoji": "🗺️",
      "model": "oku_genel_plan/oku_genel_plan/OKÜ YERLEŞKE GENEL PLAN.geometry-lod/low.glb",
      "fallback": "oku_genel_plan/oku_genel_plan/OKÜ YERLEŞKE GENEL PLAN.gltf",
      "geometryLod": "oku_genel_plan/oku_genel_plan/OKÜ YERLEŞKE GENEL PLAN.geometry-lod.json",
      "type": "Yerleşke genel planı",
      "description": "OKÜ yerleşkesinin bütününü ve yapıların kampüsteki dağılımını görün.",
      "campusZone": "Karacaoğlan Yerleşkesi",
      "category": "plan",
      "poster": "assets/posters/oku_genel_plan.webp?v=db62bec4cd",
      "sizeBytes": 6470236,
      "fallbackSizeBytes": 199167730,
      "tiers": [
        {
          "id": "low",
          "bytes": 6470236,
          "triangles": 373244
        },
        {
          "id": "medium",
          "bytes": 22980172,
          "triangles": 1409095
        },
        {
          "id": "high",
          "bytes": 58936224,
          "triangles": 4699013
        }
      ],
      "keywords": [
        "Genel Plan",
        "Master Plan",
        "Yerleşke",
        "Kampüs"
      ],
      "i18n": {
        "en": {
          "title": "OKÜ Campus Master Plan",
          "label": "OKÜ Campus Master Plan",
          "campusZone": "Karacaoğlan Campus",
          "type": "Campus master plan",
          "description": "See the whole OKÜ campus and how its buildings are laid out.",
          "keywords": [
            "Master plan",
            "Campus",
            "Overview"
          ]
        }
      },
      "campusHotspots": [
        {
          "model": "a_b_blok",
          "position": "0.1467m 0.0122m -0.3427m",
          "normal": "0.0952 0.9198 -0.3806"
        },
        {
          "model": "c_blok",
          "position": "-0.0458m 0.0167m -0.1598m",
          "normal": "-0.0453 0.9989 -0.0097"
        },
        {
          "model": "d_blok",
          "position": "-0.1033m 0.0352m -0.0313m",
          "normal": "0.2637 0.9643 -0.0247"
        },
        {
          "model": "e_blok",
          "position": "0.2102m 0.0489m 0.2850m",
          "normal": "-0.0836 0.9964 -0.0100"
        },
        {
          "model": "f_blok",
          "position": "0.2552m 0.0365m 0.1443m",
          "normal": "-0.8161 0.5394 -0.2075"
        },
        {
          "model": "ilahiyat",
          "position": "-0.2168m 0.0418m 0.2703m",
          "normal": "0.2762 0.9206 0.2762"
        },
        {
          "model": "kutuphane",
          "position": "-0.0548m 0.0436m 0.1354m",
          "normal": "0.0613 0.9810 -0.1839"
        },
        {
          "model": "rektorluk",
          "position": "0.1020m 0.0249m 0.0128m",
          "normal": "0.0362 0.9977 -0.0573"
        }
      ]
    },
    {
      "id": "rektorluk",
      "title": "Rektörlük",
      "label": "Rektörlük",
      "emoji": "🏛️",
      "model": "rektorluk/rektorluk/Rektörlük Amfi.geometry-lod/low.glb",
      "fallback": "rektorluk/rektorluk/Rektörlük Amfi.gltf",
      "geometryLod": "rektorluk/rektorluk/Rektörlük Amfi.geometry-lod.json",
      "type": "Yönetim ve amfi binası",
      "description": "Rektörlük ve amfi yapısını ayrıntılı olarak inceleyin.",
      "officialName": "Rektörlük Binası",
      "campusZone": "Karacaoğlan Yerleşkesi",
      "category": "yonetim",
      "poster": "assets/posters/rektorluk.webp?v=6f2aa08e1f",
      "sizeBytes": 2339936,
      "fallbackSizeBytes": 89274083,
      "tiers": [
        {
          "id": "low",
          "bytes": 2339936,
          "triangles": 161320
        },
        {
          "id": "medium",
          "bytes": 7920924,
          "triangles": 608380
        },
        {
          "id": "high",
          "bytes": 26346184,
          "triangles": 2028181
        }
      ],
      "geo": {
        "lat": 37.039813,
        "lng": 36.222481
      },
      "map": {
        "x": 0.6405,
        "y": 0.575,
        "confirmed": true
      },
      "sources": [
        {
          "label": "OKÜ — Ne Nerede? (yerleşke rehberi)",
          "url": "https://www.osmaniye.edu.tr/ne-nerede"
        }
      ],
      "keywords": [
        "Amfi",
        "Rektörlük Binası"
      ],
      "i18n": {
        "en": {
          "title": "Rectorate",
          "label": "Rectorate",
          "officialName": "Rectorate Building",
          "campusZone": "Karacaoğlan Campus",
          "type": "Administration and amphitheatre building",
          "description": "Inspect the rectorate and amphitheatre building in detail.",
          "keywords": [
            "Amphitheatre",
            "Rectorate building",
            "Administration"
          ],
          "sources": [
            "OKÜ — “Ne Nerede?” campus guide"
          ]
        }
      }
    }
  ]
};
