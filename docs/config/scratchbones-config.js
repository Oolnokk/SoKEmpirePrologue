window.SCRATCHBONES_CONFIG = {
  game: {
    "deck": {
      "rankCount": 10,
      "copiesPerRank": 4,
      "handSize": 10,
      "wildCount": 10,
      "playerCount": 4,
      "humanNames": [
        "You"
      ]
    },
    "nameGeneration": {
      "defaultCultureId": "mao_ao",
      "seedPrefix": "madiao-player",
      "aiCultureSelection": {
        "usePortraitSpeciesCulture": true,
        "fallbackCultureId": "mao_ao",
        "speciesToCultureId": {
          "mao_ao": "mao_ao",
          "mao-ao": "mao_ao",
          "kenkari": "kenkari"
        }
      },
      "cultures": {
        "mao_ao": {
          "id": "mao_ao",
          "displayName": "Mao-ao",
          "casing": "title",
          "birthRules": {
            "surnameFromParent": false,
            "maleFirstInitialMatchesSurnameFirstLetter": true
          },
          "marriageRules": {
            "wifeTakesHusbandSurname": true,
            "wifePrefixesHusbandFirstInitial": true
          },
          "positionedSyllables": {
            "pools": {
              "consonants": ["w", "r", "t", "y", "p", "s", "f", "g", "h", "b", "n", "m", "k"],
              "clusters": ["sh", "hy"],
              "vowels": ["a", "e", "i", "o", "u", "ai", "ao"],
              "diphthongs": ["ai", "ao"]
            },
            "firstName": {
              "syllables": { "min": 3, "max": 3 },
              "first": {
                "female": { "patterns": ["V", "Vn", "Vng"] },
                "male": { "patterns": ["CV", "CVn", "CVng", "CVr"] }
              },
              "middle": {
                "female": { "patterns": ["CV", "CVn"] },
                "male": { "patterns": ["CV", "CVn", "CVr"] }
              },
              "last": {
                "male": { "patterns": ["jei", "ji", "jo", "CV{e}", "CV{i}", "CV{o}", "CV{u}", "CV{ai}"] },
                "female": { "patterns": ["CV{a}", "CV{i}", "CV{ai}"] }
              },
              "conditionalLast": {}
            },
            "lastName": {
              "syllables": { "exact": 2 },
              "deriveFromFirstNameMaleRules": true
            }
          }
        },
        "kenkari": {
          "id": "kenkari",
          "displayName": "Kenkari",
          "casing": "title",
          "kenkariRules": {
            "phonology": {
              "consonants": ["b", "g", "h", "k", "m", "n", "p", "r", "t"],
              "consonantWeights": { "b": 1, "g": 7, "h": 7, "k": 11, "m": 10, "n": 10, "p": 8, "r": 8, "t": 8 },
              "finalConsonantWeights": { "b": 1, "g": 4, "h": 3, "k": 12, "m": 12, "n": 13, "p": 5, "r": 3, "t": 4 },
              "postGlottalFinalConsonantWeights": { "b": 1, "g": 3, "h": 2, "k": 12, "m": 12, "n": 14, "p": 3, "r": 1, "t": 2 },
              "vowels": ["a", "e", "i", "o", "u", "ai", "ey"],
              "vowelWeights": { "a": 11, "e": 4, "i": 11, "o": 8, "u": 10, "ai": 4, "ey": 4 },
              "finalVowelWeights": { "a": 12, "i": 13, "o": 4, "u": 11, "ai": 5, "ey": 0, "ao": 5 },
              "finalOnlyVowels": ["ao"],
              "minPhonemes": 2,
              "maxPhonemes": 4,
              "templateWeights": [
                { "pattern": ["V", "'V", "CV"], "weight": 18, "label": "V'CV" },
                { "pattern": ["CV", "'V"], "weight": 18, "label": "CV'V" },
                { "pattern": ["CV", "CV"], "weight": 18, "label": "CVCV" },
                { "pattern": ["CV", "'V", "CV"], "weight": 16, "label": "CV'VCV" },
                { "pattern": ["CV", "CV", "CV"], "weight": 12, "label": "CVCVCV" },
                { "pattern": ["V", "'V", "CV", "CV"], "weight": 8, "label": "V'VCVCV" }
              ]
            },
            "surnameRules": {
              "malePrefix": "ao",
              "femalePrefix": "u"
            }
          }
        }
      }
    },
    "chips": {
      "starting": 30,
      "challengeBaseTransfer": 1,
      "concedeRoundChipLoss": 1,
      "maxChallengeBet": 13,
      "raise": {
        "maxAmount": 3,
        "maxPerPlayer": 3
      },
      "clearReward": {
        "base": 1,
        "increment": 1
      }
    },
    "timers": {
      "challengeSeconds": 8,
      "aiThinkMs": 650
    },
    "layout": {
      "mode": "authored",
      "viewport": {
        "widthPx": 1920,
        "heightPx": 1080
      },
      "authored": {
        "enabled": true,
        "designWidthPx": 1600,
        "designHeightPx": 900,
        "scaleMode": "contain",
        "boxes": {
          "topbar":         { "x": -2,   "y": 11,  "width": 1123, "height": 106 },
          "sidebar":        { "x": 1354, "y": 14,  "width": 251,  "height": 681 },
          "humanSeat":      { "x": 1260, "y": 701, "width": 373,  "height": 187 },
          "hand":           { "x": 109,  "y": 698, "width": 853,  "height": 144 },
          "log":            { "x": 20,   "y": 850, "width": 1240, "height": 40  },
          "turnSpotlight":  { "x": 1122, "y": 12,  "width": 230,  "height": 200 },
          "claimCluster":   { "x": 187,  "y": 290, "width": 1037, "height": 275 },
          "challengePrompt":{ "x": 960,  "y": 699, "width": 280,  "height": 140 }
        }
      },
      "cards": {
        "baseScale": 0.5
      },
      "sizing": {
        "sidebarWidthFrac": 0.15,
        "sidebarWidthPx": 280,
        "appGapPx": 8,
        "appPaddingPx": 8,
        "seatAvatarPx": 132,
        "humanSeatAvatarPx": 204,
        "cinematicAvatarPx": 132,
        "handCardMinWidthPx": 74,
        "handCardMaxWidthPx": 104,
        "handCardMinHeightPx": 146,
        "handCardMaxHeightPx": 186,
        "handCardGapMinPx": 8,
        "handCardGapMaxPx": 12,
        "eventLogMaxHeightPx": 78,
        "controlsPaddingYpx": 12,
        "controlsPaddingXpx": 12,
        "controlsGapPx": 10,
        "handWrapPaddingYpx": 8,
        "handWrapPaddingXpx": 12,
        "handWrapGapPx": 6,
        "eventLogPaddingYpx": 8,
        "eventLogPaddingXpx": 12,
        "eventLogGapPx": 6,
        "logItemPaddingYpx": 9,
        "logItemPaddingXpx": 10
      },
      "hand": {
        "desiredHeightFrac": 0.2,
        "desiredWidthFrac": 0.5,
        "heightScale": 0.5,
        "minHeightPx": 160,
        "maxHeightPx": 360,
        "forceAllVisible": true,
        "compact": {
          "enabled": true,
          "cardMinWidthPx": 64,
          "cardGapPx": 6,
          "cardMinHeightPx": 128
        }
      },
      "tableView": {
        "desiredHeightFrac": 0.58,
        "minDominanceFrac": 0.56,
        "minHeightPx": 260,
        "maxHeightPx": 680,
        "cardVisualMode": "faceDown",
        "turnSpotlight": {
          "embedded": true,
          "pinCorner": "top-right",
          "offsetXPx": 10,
          "offsetYPx": 10
        },
        "visualFit": {
          "tableCardContainerScale": 1.25,
          "tableCardContentScale": 1,
          "claimAvatarSizePx": 180,
          "claimAvatarZoomScale": 1.2,
          "claimAvatarBorderRadiusPx": 12,
          "claimAvatarBorderColor": "transparent",
          "claimAvatarBackground": "transparent",
          "claimAvatarFirstNameOffsetPx": 26,
          "claimAvatarFirstNameFontRem": 1.34,
          "avatarAdditiveZoomScale": 1.2,
          "claimAvatarOverlayZIndex": 9990
        },
        "cinematic": {
          "enabled": true,
          "showEffects": true,
          "showAvatars": false,
          "playerInfoOffsetPx": 12,
          "playerInfoFontRem": 1.05,
          "betActionBurstTopPct": 24,
          "betActionBurstFontRem": 2,
          "betActionBurstDurationSec": 2.1
        }
      },
      "regions": {
        "actionFocus": {
          "enabled": false,
          "replaceWithFloatingClaimCluster": true
        },
        "turnSpotlight": {
          "enabled": true,
          "mustStayVisible": true,
          "avatarSizePx": 180,
          "nameBarBelowAvatar": true
        },
        "contextBox": {
          "enabled": true,
          "sharedDeclareAndChallengeSlot": true,
          "mustStayVisible": true
        }
      },
      "claimCluster": {
        "enabled": true,
        "anchor": "tableView",
        "scaleAsOne": true,
        "preserveRelativePositions": true,
        "mustStayVisible": true,
        "transparentShells": true,
        "geometry": {
          "centerXPct": 0.5,
          "centerYPct": 0.5,
          "widthPctOfTableView": 1.0,
          "heightPctOfTableView": 1.0
        },
        "elements": {
          "claimRankBox": {
            "xPct": 0.489583,
            "yPct": 0.115385,
            "wPct": 0.0625,
            "hPct": 0.230769
          },
          "claimHandBar": {
            "xPct": 0.5,
            "yPct": 0.538462,
            "wPct": 0.5,
            "hPct": 0.461538
          },
          "actorAvatarFloat": {
            "xPct": 0.0625,
            "yPct": 0.538462,
            "wPct": 0.125,
            "hPct": 0.461538
          },
          "reactorAvatarFloat": {
            "xPct": 0.9375,
            "yPct": 0.538462,
            "wPct": 0.125,
            "hPct": 0.461538
          },
          "claimTimesBoxLeft": {
            "xPct": 0.1875,
            "yPct": 0.538462,
            "wPct": 0.041667,
            "hPct": 0.153846
          },
          "claimCountBoxLeft": {
            "xPct": 0.1875,
            "yPct": 0.846154,
            "wPct": 0.083333,
            "hPct": 0.307692
          },
          "claimTimesBoxRight": {
            "xPct": 0.8125,
            "yPct": 0.538462,
            "wPct": 0.041667,
            "hPct": 0.153846
          },
          "claimCountBoxRight": {
            "xPct": 0.8125,
            "yPct": 0.846154,
            "wPct": 0.083333,
            "hPct": 0.307692
          }
        }
      },
      "shells": {
        "transparentFloatingBoxes": true,
        "disablePanelChromeForFloatingBoxes": true
      },
      "controlsToHandRelationship": "below",
      "actionColumn": {
        "heightScale": 0.25
      },
      "controls": {
        "heightScale": 0.5
      },
      "allowChallengeOverflow": true,
      "background": {
        "tabletopImageSrc": "./docs/assets/hud/tabletop.png"
      },
      "lighting": {
        "flame": {
          "xPct": 0.5,
          "yPct": -0.12,
          "coreAlpha": 0.2,
          "midAlpha": 0.12,
          "farAlpha": 0.05,
          "flickerSeconds": 2.9
        },
        "cardShadow": {
          "offsetXPx": 1.5,
          "offsetYPx": 9,
          "blurPx": 12,
          "spreadPx": -2,
          "alpha": 0.34,
          "contactAlpha": 0.2
        }
      },
      "fitter": {
        "enabled": true,
        "reflowDebounceMs": 90,
        "overflowTolerancePx": 1,
        "minReadableFontScale": 0.72,
        "stages": [
          {
            "fontScale": 0.96,
            "imageScale": 0.95,
            "gapScale": 0.94
          },
          {
            "fontScale": 0.92,
            "imageScale": 0.9,
            "gapScale": 0.88
          },
          {
            "fontScale": 0.88,
            "imageScale": 0.86,
            "gapScale": 0.82
          },
          {
            "fontScale": 0.84,
            "imageScale": 0.82,
            "gapScale": 0.76
          },
          {
            "fontScale": 0.8,
            "imageScale": 0.78,
            "gapScale": 0.7
          },
          {
            "fontScale": 0.76,
            "imageScale": 0.74,
            "gapScale": 0.64
          }
        ],
        "targets": {
          "tableView": {
            "selector": ".tableView",
            "containmentSelector": ".tableViewCards",
            "maxStage": 4,
            "minReadableFontScale": 0.8
          },
          "actionFocus": {
            "selector": ".actionFocus",
            "containmentSelector": ".actionFocusMain",
            "maxStage": 6,
            "minReadableFontScale": 0.72
          },
          "actionColumn": {
            "selector": ".actionColumn",
            "maxStage": 4,
            "minReadableFontScale": 0.76
          },
          "contextBox": {
            "selector": ".contextBox",
            "maxStage": 5,
            "minReadableFontScale": 0.74
          },
          "turnSpotlight": {
            "selector": ".turnSpotlight",
            "maxStage": 5,
            "minReadableFontScale": 0.74
          },
          "claimCluster": {
            "selector": ".claimCluster",
            "maxStage": 4,
            "minReadableFontScale": 0.72
          },
          "sidebarSeats": {
            "selector": "#aiSidebar",
            "maxStage": 6,
            "minReadableFontScale": 0.72
          },
          "handCards": {
            "selector": ".handWrap",
            "containmentSelector": ".handScroll",
            "maxStage": 6,
            "minReadableFontScale": 0.76
          },
          "logs": {
            "selector": ".eventLog",
            "maxStage": 4,
            "minReadableFontScale": 0.78
          },
          "controls": {
            "selector": ".controls",
            "maxStage": 6,
            "minReadableFontScale": 0.78
          }
        },
        "overlap": {
          "enabled": true,
          "tolerancePx": 0,
          "criticalRegions": {
            "tableView": ".tableView",
            "controls": ".controls",
            "hand": ".handWrap",
            "actionColumn": ".actionColumn",
            "contextBox": ".contextBox",
            "log": ".eventLog",
            "sidebar": "#aiSidebar",
            "turnSpotlight": ".turnSpotlight",
            "claimCluster": ".claimCluster",
            "challenge": "#challengePromptPane"
          },
          "collapseOrder": [],
          "preserveRegions": [
            "tableView",
            "controls",
            "sidebar",
            "turnSpotlight",
            "claimCluster",
            "contextBox"
          ],
          "minContainerScale": 0.7,
          "containerScaleStep": 0.02
        }
      },
      "projectionMapping": {
        "editor": {
          "step": 0.01,
          "panelTitle": "Projection Vars",
          "sliderClamp": {
            "multiplierMin": 0,
            "multiplierMax": 5,
            "absoluteMin": -2000,
            "absoluteMax": 2000
          },
          "multiplierVarHints": [
            "scale",
            "frac",
            "ratio",
            "multiplier"
          ],
          "sizePositionVarHints": [
            "width",
            "height",
            "size",
            "scale",
            "gap",
            "padding",
            "min",
            "max",
            "offset",
            "top",
            "right",
            "bottom",
            "left",
            "x",
            "y",
            "row",
            "column",
            "frac",
            "avatar",
            "card"
          ]
        },
        "sharedVars": [
          "--layout-challenge-font-scale",
          "--layout-challenge-image-scale",
          "--layout-challenge-gap-scale",
          "--layout-fit-font-scale",
          "--layout-fit-image-scale",
          "--layout-fit-gap-scale"
        ],
        "varsByProjId": {
          "topbar": [
            "--layout-app-gap",
            "--layout-app-padding"
          ],
          "sidebar": [
            "--layout-sidebar-width",
            "--layout-sidebar-content-scale",
            "--layout-seat-avatar-size"
          ],
          "seat-*": [
            "--layout-seat-avatar-size",
            "--layout-sidebar-content-scale"
          ],
          "avatar-*": [
            "--layout-seat-avatar-size",
            "--layout-human-seat-avatar-size",
            "--layout-cinematic-avatar-size"
          ],
          "human-seat-zone": [
            "--layout-human-seat-avatar-size"
          ],
          "human-seat": [
            "--layout-human-seat-avatar-size",
            "--layout-sidebar-content-scale"
          ],
          "panel": [
            "--layout-table-dominance-frac",
            "--layout-table-view-height",
            "--layout-table-view-min-height",
            "--layout-table-view-max-height"
          ],
          "table-view": [
            "--layout-table-view-height",
            "--layout-table-view-min-height",
            "--layout-table-view-max-height",
            "--layout-card-base-scale",
            "--layout-card-scale",
            "--layout-card-table-base-width",
            "--layout-card-table-base-height",
            "--layout-card-mini-base-width",
            "--layout-card-mini-base-height",
            "--layout-table-card-auto-scale",
            "--layout-fit-additive-avatar-zoom"
          ],
          "claim-cluster": [
            "--layout-claim-cluster-center-x",
            "--layout-claim-cluster-center-y",
            "--layout-claim-cluster-width",
            "--layout-claim-cluster-height",
            "--layout-claim-avatar-size",
            "--layout-claim-avatar-zoom",
            "--layout-claim-avatar-border-radius",
            "--layout-claim-avatar-border-color",
            "--layout-claim-avatar-background"
          ],
          "claim-avatar-*": [
            "--layout-claim-avatar-size",
            "--layout-claim-avatar-zoom",
            "--layout-claim-avatar-border-radius",
            "--layout-claim-avatar-border-color",
            "--layout-claim-avatar-background"
          ],
          "claim-hand-bar": [
            "--layout-card-mini-base-width",
            "--layout-card-mini-base-height",
            "--layout-card-scale"
          ],
          "claim-rank-box": [
            "--layout-challenge-font-scale",
            "--layout-fit-font-scale"
          ],
          "claim-count-left": [
            "--layout-challenge-font-scale",
            "--layout-fit-font-scale"
          ],
          "claim-times-left": [
            "--layout-challenge-font-scale",
            "--layout-fit-font-scale"
          ],
          "claim-count-right": [
            "--layout-challenge-font-scale",
            "--layout-fit-font-scale"
          ],
          "claim-times-right": [
            "--layout-challenge-font-scale",
            "--layout-fit-font-scale"
          ],
          "cinematic": [
            "--layout-cinematic-avatar-size"
          ],
          "action-column": [
            "--layout-action-column-height-scale",
            "--layout-action-column-max-height"
          ],
          "controls": [
            "--layout-controls-height-scale",
            "--layout-controls-max-height",
            "--layout-controls-padding-y",
            "--layout-controls-padding-x",
            "--layout-controls-gap"
          ],
          "challenge-prompt": [
            "--layout-challenge-font-scale",
            "--layout-challenge-image-scale",
            "--layout-challenge-gap-scale",
            "--layout-controls-height-scale",
            "--layout-controls-max-height",
            "--layout-controls-padding-y",
            "--layout-controls-padding-x",
            "--layout-controls-gap"
          ],
          "hand": [
            "--hand-height-frac",
            "--layout-hand-height-scale",
            "--layout-hand-min-height",
            "--layout-hand-max-height",
            "--layout-hand-max-row-height",
            "--layout-hand-card-min-width",
            "--layout-hand-card-max-width",
            "--layout-hand-card-min-height",
            "--layout-hand-card-max-height",
            "--layout-hand-card-gap-min",
            "--layout-hand-card-gap-max",
            "--layout-hand-wrap-padding-y",
            "--layout-hand-wrap-padding-x",
            "--layout-hand-wrap-gap",
            "--layout-card-base-scale",
            "--layout-card-hand-scale",
            "--layout-card-scale",
            "--layout-card-hit-min-width",
            "--layout-card-hit-min-height",
            "--layout-card-label-font-base",
            "--layout-card-label-gap-base",
            "--layout-card-label-padding-y-base",
            "--layout-card-label-padding-x-base",
            "--layout-card-label-offset-base",
            "--layout-card-label-radius-base"
          ],
          "log": [
            "--layout-event-log-max-height",
            "--layout-event-log-padding-y",
            "--layout-event-log-padding-x",
            "--layout-event-log-gap",
            "--layout-log-item-padding-y",
            "--layout-log-item-padding-x",
            "--layout-log-max-row-height"
          ]
        },
        "selectorVarsByProjId": {
          "table-view": {
            ".tableViewCard, .tableViewCard img": [
              "--layout-card-base-scale",
              "--layout-card-scale",
              "--layout-card-table-base-width",
              "--layout-card-table-base-height"
            ],
            ".claimHandBar, .claimHandBar .tableViewCard, .claimHandBar .tableViewCard img": [
              "--layout-card-mini-base-width",
              "--layout-card-mini-base-height",
              "--layout-card-scale"
            ],
            ".actorAvatarFloat, .reactorAvatarFloat, .actorAvatarFloat canvas, .reactorAvatarFloat canvas, .seatPortrait": [
              "--layout-seat-avatar-size",
              "--layout-human-seat-avatar-size",
              "--layout-cinematic-avatar-size",
              "--layout-sidebar-content-scale"
            ],
            ".claimRankBox, .claimCountBoxLeft, .claimCountBoxRight, .turnSpotlightNameBar": [
              "--layout-challenge-font-scale",
              "--layout-fit-font-scale"
            ]
          },
          "sidebar": {
            ".seatAvatarBox, .seatPortrait": [
              "--layout-seat-avatar-size",
              "--layout-sidebar-content-scale"
            ],
            ".seatName, .seatMeta, .seatStatus, .seatSeed, .seatTags": [
              "--layout-sidebar-content-scale"
            ]
          },
          "seat-*": {
            ".seatAvatarBox, .seatPortrait": [
              "--layout-seat-avatar-size",
              "--layout-sidebar-content-scale"
            ],
            ".seatName, .seatMeta, .seatStatus, .seatSeed, .seatTags": [
              "--layout-sidebar-content-scale"
            ]
          },
          "human-seat": {
            ".seatAvatarBox, .seatPortrait": [
              "--layout-human-seat-avatar-size"
            ],
            ".seatName, .seatMeta, .seatStatus, .humanSeatChipBadge": [
              "--layout-sidebar-content-scale"
            ]
          },
          "hand": {
            ".card, .cardArt": [
              "--layout-card-base-scale",
              "--layout-card-hand-scale",
              "--layout-card-scale",
              "--layout-hand-card-min-width",
              "--layout-hand-card-max-width",
              "--layout-hand-card-min-height",
              "--layout-hand-card-max-height",
              "--layout-card-hit-min-width",
              "--layout-card-hit-min-height"
            ],
            ".cardLabel, .cardGlyph, .cardText": [
              "--layout-card-label-font-base",
              "--layout-card-label-gap-base",
              "--layout-card-label-padding-y-base",
              "--layout-card-label-padding-x-base",
              "--layout-card-label-offset-base",
              "--layout-card-label-radius-base",
              "--layout-card-scale"
            ],
            ".handScroll": [
              "--layout-hand-card-gap-min",
              "--layout-hand-card-gap-max"
            ]
          }
        },
        "fallbackVars": [
          "--layout-app-gap",
          "--layout-app-padding",
          "--layout-sidebar-width",
          "--layout-sidebar-content-scale",
          "--layout-table-view-height",
          "--layout-table-view-min-height",
          "--layout-table-view-max-height",
          "--layout-table-dominance-frac",
          "--layout-action-column-height-scale",
          "--layout-action-column-max-height",
          "--layout-controls-height-scale",
          "--layout-controls-max-height",
          "--layout-hand-height-scale",
          "--layout-card-base-scale",
          "--layout-card-hand-scale",
          "--layout-hand-min-height",
          "--layout-hand-max-height",
          "--layout-hand-card-min-width",
          "--layout-hand-card-max-width",
          "--layout-hand-card-min-height",
          "--layout-hand-card-max-height",
          "--layout-hand-wrap-padding-y",
          "--layout-hand-wrap-padding-x",
          "--layout-hand-wrap-gap",
          "--layout-event-log-max-height",
          "--layout-log-max-row-height"
        ]
      }
    },
    "uiText": {
      "initialBanner": "Open a round by selecting one or more cards, then declare a number.",
      "yourLeadBanner": "Your lead. Select cards and declare any number.",
      "pickCardWarning": "Pick at least one card before playing.",
      "challengeTimerLabel": "Auto: let it stand",
      "challengePromptTemplate": "{seat} declared {count} × {rank}. Challenge before the timer runs out, or let it stand.",
      "letStandButton": "Let it stand"
    },
    "assets": {
      "cards": {
        "hudBasePath": "./docs/assets/hud/",
        "wild": {
          "src": "2DScratchBoneWild.png",
          "fallbackSrc": "2DScratchBoneWild.png"
        },
        "flipped": {
          "src": "2DScratchboneFlipped.png",
          "fallbackSrc": "2DScratchBoneFlipped.png"
        },
        "rankTemplate": {
          "src": "2DScratchbone{rank}.png",
          "fallbackSrc": "2DScratchbones{rank}.png"
        }
      },
      "audio": {
        "enabled": true,
        "sfxVolume": 0.92,
        "bgmVolume": 0.48,
        "musicFadeMs": 280,
        "movement": {
          "handToTable": { "url": "./docs/assets/audio/scratchbones/sfx/hand-to-table.mp3", "pitch": 1.0, "tempo": 1.0, "volume": 0.95 },
          "tableToClaim": { "url": "./docs/assets/audio/scratchbones/sfx/table-to-claim.mp3", "pitch": 1.08, "tempo": 1.0, "volume": 0.9 },
          "claimToHand": { "url": "./docs/assets/audio/scratchbones/sfx/claim-to-hand.mp3", "pitch": 0.92, "tempo": 0.98, "volume": 0.94 },
          "opponentToTable": { "url": "./docs/assets/audio/scratchbones/sfx/opponent-to-table.mp3", "pitch": 0.88, "tempo": 0.94, "volume": 0.9 },
          "fadeIn": { "url": "./docs/assets/audio/scratchbones/sfx/card-fade.mp3", "pitch": 1.0, "tempo": 1.02, "volume": 0.78 }
        },
        "challenge": {
          "start": { "url": "./docs/assets/audio/scratchbones/sfx/challenge-start.mp3", "pitch": 1.0, "tempo": 1.0, "volume": 1.0 },
          "end": { "url": "./docs/assets/audio/scratchbones/sfx/challenge-end.mp3", "pitch": 1.0, "tempo": 1.0, "volume": 1.0 }
        },
        "bgm": {
          "playlist": [
            "./docs/assets/audio/scratchbones/bgm/table-loop-01.mp3",
            "./docs/assets/audio/scratchbones/bgm/table-loop-02.mp3"
          ],
          "challenge": "./docs/assets/audio/scratchbones/bgm/challenge-loop.mp3"
        }
      },
      "portrait": {
        "assetBase": "./docs/assets/",
        "configBase": "./docs/config/"
      }
    }
  }
};

// Future Scratchbones-authored UI modes live under SCRATCHBONES_CONFIG.game.layout.
window.SCRATCHBONES_CONFIG.game.layout.mode = window.SCRATCHBONES_CONFIG.game.layout.mode || 'responsive';
window.SCRATCHBONES_CONFIG.game.layout.authored = window.SCRATCHBONES_CONFIG.game.layout.authored || {};
window.SCRATCHBONES_CONFIG.game.layout.fitter = window.SCRATCHBONES_CONFIG.game.layout.fitter || {};

// Most recent config-boundary cleanup: this file is now the authoritative Scratchbones-only config source.
