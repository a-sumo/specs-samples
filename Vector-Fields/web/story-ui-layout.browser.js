window.STORY_UI_LAYOUT = {
  "version": 1,
  "texture": {
    "widthPx": 1500,
    "heightPx": 1000,
    "widthCm": 30,
    "heightCm": 20,
    "pixelsPerCm": 50
  },
  "panel": {
    "cornerRadiusPx": 0,
    "cornerRadiusCm": 0,
    "paddingPx": 70,
    "paddingCm": 1.4,
    "cardGapPx": {
      "x": 40,
      "y": 30
    },
    "cardGapCm": {
      "x": 0.8,
      "y": 0.6
    }
  },
  "steps": [
    {
      "id": "intro",
      "index": "01",
      "title": "Intro",
      "root": "C00_Intro",
      "canCalibrate": false
    },
    {
      "id": "theory",
      "index": "02",
      "title": "Theory",
      "root": "C02_Theory",
      "canCalibrate": false
    },
    {
      "id": "examples",
      "index": "03",
      "title": "Examples",
      "root": "C03_Real_World_Examples",
      "canCalibrate": true
    }
  ],
  "examples": [
    {
      "id": "gravity",
      "index": "01",
      "title": "Gravitational Fields",
      "canCalibrate": true
    },
    {
      "id": "magnetism",
      "index": "02",
      "title": "Magnetism",
      "canCalibrate": true
    },
    {
      "id": "wind",
      "index": "03",
      "title": "Wind",
      "canCalibrate": true
    }
  ],
  "theoryModes": [
    {
      "id": "expansion",
      "index": "01",
      "title": "Expansion"
    },
    {
      "id": "contraction",
      "index": "02",
      "title": "Contraction"
    },
    {
      "id": "curl",
      "index": "03",
      "title": "Curl"
    },
    {
      "id": "motion",
      "index": "04",
      "title": "Motion"
    }
  ],
  "gradientPalettes": [
    {
      "id": "jet",
      "index": "01",
      "title": "Jet"
    },
    {
      "id": "viridis",
      "index": "02",
      "title": "Viridis"
    },
    {
      "id": "plasma",
      "index": "03",
      "title": "Plasma"
    }
  ],
  "slots": [
    {
      "id": "title",
      "role": "title",
      "px": {
        "x": 70,
        "y": 62,
        "width": 780,
        "height": 116
      },
      "cm": {
        "x": -5.8,
        "y": 7.6,
        "width": 15.6,
        "height": 2.32
      }
    },
    {
      "id": "examples_title",
      "role": "title",
      "px": {
        "x": 350,
        "y": 54,
        "width": 640,
        "height": 100
      },
      "cm": {
        "x": -1.6,
        "y": 7.92,
        "width": 12.8,
        "height": 2
      }
    },
    {
      "id": "example_detail_title",
      "role": "title",
      "px": {
        "x": 350,
        "y": 54,
        "width": 640,
        "height": 100
      },
      "cm": {
        "x": -1.6,
        "y": 7.92,
        "width": 12.8,
        "height": 2
      }
    },
    {
      "id": "theory_title",
      "role": "title",
      "px": {
        "x": 430,
        "y": 54,
        "width": 640,
        "height": 100
      },
      "cm": {
        "x": 0,
        "y": 7.92,
        "width": 12.8,
        "height": 2
      }
    },
    {
      "id": "status",
      "role": "status",
      "px": {
        "x": 1016,
        "y": 70,
        "width": 414,
        "height": 96
      },
      "cm": {
        "x": 9.46,
        "y": 7.64,
        "width": 8.28,
        "height": 1.92
      }
    },
    {
      "id": "utility_follow",
      "role": "utility",
      "px": {
        "x": 1008,
        "y": 70,
        "width": 190,
        "height": 76
      },
      "cm": {
        "x": 7.06,
        "y": 7.84,
        "width": 3.8,
        "height": 1.52
      }
    },
    {
      "id": "utility_fold",
      "role": "utility",
      "px": {
        "x": 1228,
        "y": 70,
        "width": 190,
        "height": 76
      },
      "cm": {
        "x": 11.46,
        "y": 7.84,
        "width": 3.8,
        "height": 1.52
      }
    },
    {
      "id": "utility_plane_floor",
      "role": "utility",
      "px": {
        "x": 1008,
        "y": 158,
        "width": 190,
        "height": 64
      },
      "cm": {
        "x": 7.06,
        "y": 6.2,
        "width": 3.8,
        "height": 1.28
      }
    },
    {
      "id": "utility_plane_front",
      "role": "utility",
      "px": {
        "x": 1228,
        "y": 158,
        "width": 190,
        "height": 64
      },
      "cm": {
        "x": 11.46,
        "y": 6.2,
        "width": 3.8,
        "height": 1.28
      }
    },
    {
      "id": "variant_artemis",
      "role": "example_variant_artemis",
      "px": {
        "x": 90,
        "y": 524,
        "width": 1320,
        "height": 268
      },
      "cm": {
        "x": 0,
        "y": -3.16,
        "width": 26.4,
        "height": 5.36
      }
    },
    {
      "id": "variant_primary",
      "role": "example_variant",
      "px": {
        "x": 90,
        "y": 552,
        "width": 400,
        "height": 82
      },
      "cm": {
        "x": -9.2,
        "y": -1.86,
        "width": 8,
        "height": 1.64
      }
    },
    {
      "id": "variant_secondary",
      "role": "example_variant",
      "px": {
        "x": 550,
        "y": 552,
        "width": 400,
        "height": 82
      },
      "cm": {
        "x": 0,
        "y": -1.86,
        "width": 8,
        "height": 1.64
      }
    },
    {
      "id": "example_mode_a",
      "role": "example_mode",
      "px": {
        "x": 90,
        "y": 680,
        "width": 400,
        "height": 82
      },
      "cm": {
        "x": -9.2,
        "y": -4.42,
        "width": 8,
        "height": 1.64
      }
    },
    {
      "id": "example_mode_b",
      "role": "example_mode",
      "px": {
        "x": 550,
        "y": 680,
        "width": 400,
        "height": 82
      },
      "cm": {
        "x": 0,
        "y": -4.42,
        "width": 8,
        "height": 1.64
      }
    },
    {
      "id": "example_mode_c",
      "role": "example_mode",
      "px": {
        "x": 1010,
        "y": 680,
        "width": 400,
        "height": 82
      },
      "cm": {
        "x": 9.2,
        "y": -4.42,
        "width": 8,
        "height": 1.64
      }
    },
    {
      "id": "card_intro",
      "role": "card",
      "px": {
        "x": 70,
        "y": 300,
        "width": 400,
        "height": 250
      },
      "cm": {
        "x": -9.6,
        "y": 1.5,
        "width": 8,
        "height": 5
      }
    },
    {
      "id": "card_theory",
      "role": "card",
      "px": {
        "x": 550,
        "y": 300,
        "width": 400,
        "height": 250
      },
      "cm": {
        "x": 0,
        "y": 1.5,
        "width": 8,
        "height": 5
      }
    },
    {
      "id": "card_examples",
      "role": "card",
      "px": {
        "x": 1030,
        "y": 300,
        "width": 400,
        "height": 250
      },
      "cm": {
        "x": 9.6,
        "y": 1.5,
        "width": 8,
        "height": 5
      }
    },
    {
      "id": "examples_back",
      "role": "examples_button",
      "px": {
        "x": 70,
        "y": 70,
        "width": 240,
        "height": 84
      },
      "cm": {
        "x": -11.2,
        "y": 7.76,
        "width": 4.8,
        "height": 1.68
      }
    },
    {
      "id": "example_gravity",
      "role": "example_card",
      "px": {
        "x": 70,
        "y": 290,
        "width": 1360,
        "height": 140
      },
      "cm": {
        "x": 0,
        "y": 2.8,
        "width": 27.2,
        "height": 2.8
      }
    },
    {
      "id": "example_magnetism",
      "role": "example_card",
      "px": {
        "x": 70,
        "y": 474,
        "width": 1360,
        "height": 140
      },
      "cm": {
        "x": 0,
        "y": -0.88,
        "width": 27.2,
        "height": 2.8
      }
    },
    {
      "id": "example_wind",
      "role": "example_card",
      "px": {
        "x": 70,
        "y": 658,
        "width": 1360,
        "height": 140
      },
      "cm": {
        "x": 0,
        "y": -4.56,
        "width": 27.2,
        "height": 2.8
      }
    },
    {
      "id": "example_info",
      "role": "example_info",
      "px": {
        "x": 90,
        "y": 292,
        "width": 1320,
        "height": 210
      },
      "cm": {
        "x": 0,
        "y": 2.06,
        "width": 26.4,
        "height": 4.2
      }
    },
    {
      "id": "theory_mode_expansion",
      "role": "theory_mode",
      "px": {
        "x": 170,
        "y": 312,
        "width": 250,
        "height": 76
      },
      "cm": {
        "x": -9.1,
        "y": 3,
        "width": 5,
        "height": 1.52
      }
    },
    {
      "id": "theory_mode_contraction",
      "role": "theory_mode",
      "px": {
        "x": 470,
        "y": 312,
        "width": 250,
        "height": 76
      },
      "cm": {
        "x": -3.1,
        "y": 3,
        "width": 5,
        "height": 1.52
      }
    },
    {
      "id": "theory_mode_curl",
      "role": "theory_mode",
      "px": {
        "x": 770,
        "y": 312,
        "width": 250,
        "height": 76
      },
      "cm": {
        "x": 2.9,
        "y": 3,
        "width": 5,
        "height": 1.52
      }
    },
    {
      "id": "theory_mode_motion",
      "role": "theory_mode",
      "px": {
        "x": 1070,
        "y": 312,
        "width": 250,
        "height": 76
      },
      "cm": {
        "x": 8.9,
        "y": 3,
        "width": 5,
        "height": 1.52
      }
    },
    {
      "id": "theory_info",
      "role": "theory_info",
      "px": {
        "x": 76,
        "y": 452,
        "width": 444,
        "height": 336
      },
      "cm": {
        "x": -9.04,
        "y": -2.4,
        "width": 8.88,
        "height": 6.72
      }
    },
    {
      "id": "gradient_jet",
      "role": "gradient_palette",
      "px": {
        "x": 604,
        "y": 460,
        "width": 314,
        "height": 80
      },
      "cm": {
        "x": 0.22,
        "y": 0,
        "width": 6.28,
        "height": 1.6
      }
    },
    {
      "id": "gradient_viridis",
      "role": "gradient_palette",
      "px": {
        "x": 948,
        "y": 460,
        "width": 314,
        "height": 80
      },
      "cm": {
        "x": 7.1,
        "y": 0,
        "width": 6.28,
        "height": 1.6
      }
    },
    {
      "id": "gradient_plasma",
      "role": "gradient_palette",
      "px": {
        "x": 604,
        "y": 564,
        "width": 314,
        "height": 80
      },
      "cm": {
        "x": 0.22,
        "y": -2.08,
        "width": 6.28,
        "height": 1.6
      }
    },
    {
      "id": "progress",
      "role": "progress",
      "px": {
        "x": 390,
        "y": 816,
        "width": 720,
        "height": 112
      },
      "cm": {
        "x": 0,
        "y": -7.44,
        "width": 14.4,
        "height": 2.24
      }
    },
    {
      "id": "nav_back",
      "role": "button",
      "px": {
        "x": 70,
        "y": 816,
        "width": 260,
        "height": 112
      },
      "cm": {
        "x": -11,
        "y": -7.44,
        "width": 5.2,
        "height": 2.24
      }
    },
    {
      "id": "nav_next",
      "role": "button",
      "px": {
        "x": 1170,
        "y": 816,
        "width": 260,
        "height": 112
      },
      "cm": {
        "x": 11,
        "y": -7.44,
        "width": 5.2,
        "height": 2.24
      }
    }
  ]
};
