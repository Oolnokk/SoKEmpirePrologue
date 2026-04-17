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
    "chips": {
      "starting": 12,
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
          "topbar": { "x": 0, "y": 20, "width": 1220, "height": 80 },
          "sidebar": { "x": 1360, "y": 20, "width": 240, "height": 210 },
          "panel": { "x": 220, "y": 240, "width": 960, "height": 260 },
          "humanSeat": { "x": 1180, "y": 620, "width": 420, "height": 220 },
          "hand": { "x": 20, "y": 700, "width": 940, "height": 140 },
          "log": { "x": 20, "y": 850, "width": 1240, "height": 40 },
          "turnSpotlight": { "x": 1010, "y": 250, "width": 160, "height": 180 },
          "claimCluster": { "x": 220, "y": 240, "width": 960, "height": 260 },
          "challengePrompt": { "x": 960, "y": 700, "width": 280, "height": 140 }
        }
      },
      "cards": {
        "baseScale": 0.25
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
          "tableCardContentScale": 0.8,
          "claimAvatarContainerScale": 1.25,
          "claimAvatarContentScale": 0.8,
          "avatarAdditiveZoomScale": 1.2
        },
        "cinematic": {
          "enabled": true,
          "showEffects": true
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
