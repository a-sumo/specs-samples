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
      "root": "C00_Intro"
    },
    {
      "id": "motion_fields",
      "index": "02",
      "title": "Motion Fields",
      "root": "C01_Motion_Fields"
    },
    {
      "id": "theory",
      "index": "03",
      "title": "Theory",
      "root": "C02_Theory"
    },
    {
      "id": "examples",
      "index": "04",
      "title": "Real World Examples",
      "root": "C03_Real_World_Examples"
    }
  ],
  "examples": [
    {
      "id": "gravity",
      "index": "01",
      "title": "Gravity"
    },
    {
      "id": "magnetism",
      "index": "02",
      "title": "Magnetism"
    },
    {
      "id": "wind",
      "index": "03",
      "title": "Wind"
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
        "y": 62,
        "width": 640,
        "height": 116
      },
      "cm": {
        "x": -1.6,
        "y": 7.6,
        "width": 12.8,
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
      "id": "card_intro",
      "role": "card",
      "px": {
        "x": 70,
        "y": 266,
        "width": 660,
        "height": 170
      },
      "cm": {
        "x": -7,
        "y": 2.98,
        "width": 13.2,
        "height": 3.4
      }
    },
    {
      "id": "card_motion_fields",
      "role": "card",
      "px": {
        "x": 770,
        "y": 266,
        "width": 660,
        "height": 170
      },
      "cm": {
        "x": 7,
        "y": 2.98,
        "width": 13.2,
        "height": 3.4
      }
    },
    {
      "id": "card_theory",
      "role": "card",
      "px": {
        "x": 70,
        "y": 474,
        "width": 660,
        "height": 170
      },
      "cm": {
        "x": -7,
        "y": -1.18,
        "width": 13.2,
        "height": 3.4
      }
    },
    {
      "id": "card_examples",
      "role": "card",
      "px": {
        "x": 770,
        "y": 474,
        "width": 660,
        "height": 170
      },
      "cm": {
        "x": 7,
        "y": -1.18,
        "width": 13.2,
        "height": 3.4
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
        "y": 266,
        "width": 1360,
        "height": 154
      },
      "cm": {
        "x": 0,
        "y": 3.14,
        "width": 27.2,
        "height": 3.08
      }
    },
    {
      "id": "example_magnetism",
      "role": "example_card",
      "px": {
        "x": 70,
        "y": 458,
        "width": 1360,
        "height": 154
      },
      "cm": {
        "x": 0,
        "y": -0.7,
        "width": 27.2,
        "height": 3.08
      }
    },
    {
      "id": "example_wind",
      "role": "example_card",
      "px": {
        "x": 70,
        "y": 650,
        "width": 1360,
        "height": 154
      },
      "cm": {
        "x": 0,
        "y": -4.54,
        "width": 27.2,
        "height": 3.08
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
