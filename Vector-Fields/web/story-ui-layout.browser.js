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
    "cornerRadiusPx": 64,
    "cornerRadiusCm": 1.28,
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
      "root": "C00_Intro_Field_Basics"
    },
    {
      "id": "definition",
      "index": "02",
      "title": "Definition",
      "root": "C01_Math_Definition"
    },
    {
      "id": "motion",
      "index": "03",
      "title": "Motion",
      "root": "C02_Motion_Field_Plane"
    },
    {
      "id": "patterns",
      "index": "04",
      "title": "Patterns",
      "root": "C02_Transition_Field_Cubes"
    },
    {
      "id": "metrics",
      "index": "05",
      "title": "Metrics",
      "root": "C02_Metrics_Probe"
    },
    {
      "id": "examples",
      "index": "06",
      "title": "Three fields",
      "root": "C03_Three_Fields_Gravity_Magnetism_Wind"
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
      "id": "utility_follow_folded",
      "role": "utility_folded",
      "px": {
        "x": 1080,
        "y": 914,
        "width": 190,
        "height": 76
      },
      "cm": {
        "x": 8.5,
        "y": -9.04,
        "width": 3.8,
        "height": 1.52
      }
    },
    {
      "id": "utility_fold_folded",
      "role": "utility_folded",
      "px": {
        "x": 1295,
        "y": 914,
        "width": 190,
        "height": 76
      },
      "cm": {
        "x": 12.8,
        "y": -9.04,
        "width": 3.8,
        "height": 1.52
      }
    },
    {
      "id": "card_intro",
      "role": "card",
      "px": {
        "x": 70,
        "y": 230,
        "width": 660,
        "height": 136
      },
      "cm": {
        "x": -7,
        "y": 4.04,
        "width": 13.2,
        "height": 2.72
      }
    },
    {
      "id": "card_definition",
      "role": "card",
      "px": {
        "x": 770,
        "y": 230,
        "width": 660,
        "height": 136
      },
      "cm": {
        "x": 7,
        "y": 4.04,
        "width": 13.2,
        "height": 2.72
      }
    },
    {
      "id": "card_motion",
      "role": "card",
      "px": {
        "x": 70,
        "y": 396,
        "width": 660,
        "height": 136
      },
      "cm": {
        "x": -7,
        "y": 0.72,
        "width": 13.2,
        "height": 2.72
      }
    },
    {
      "id": "card_patterns",
      "role": "card",
      "px": {
        "x": 770,
        "y": 396,
        "width": 660,
        "height": 136
      },
      "cm": {
        "x": 7,
        "y": 0.72,
        "width": 13.2,
        "height": 2.72
      }
    },
    {
      "id": "card_metrics",
      "role": "card",
      "px": {
        "x": 70,
        "y": 562,
        "width": 660,
        "height": 136
      },
      "cm": {
        "x": -7,
        "y": -2.6,
        "width": 13.2,
        "height": 2.72
      }
    },
    {
      "id": "card_examples",
      "role": "card",
      "px": {
        "x": 770,
        "y": 562,
        "width": 660,
        "height": 136
      },
      "cm": {
        "x": 7,
        "y": -2.6,
        "width": 13.2,
        "height": 2.72
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
