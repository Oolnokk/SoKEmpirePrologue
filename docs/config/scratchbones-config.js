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
        "designWidthPx": 1920,
        "designHeightPx": 1080,
        "scaleMode": "contain",
        "boxes": {
          "topbar": { "x": 8, "y": 8, "width": 1624, "height": 120 },
          "sidebar": { "x": 1640, "y": 8, "width": 272, "height": 780 },
          "panel": { "x": 8, "y": 136, "width": 1624, "height": 560 },
          "humanSeat": { "x": 1640, "y": 796, "width": 272, "height": 176 },
          "contextBox": { "x": 8, "y": 704, "width": 1624, "height": 196 },
          "hand": { "x": 8, "y": 912, "width": 1624, "height": 160 },
          "log": { "x": 8, "y": 968, "width": 1624, "height": 104 },
          "tableView": { "x": 18, "y": 146, "width": 1604, "height": 540 },
          "turnSpotlight": { "x": 1380, "y": 164, "width": 220, "height": 220 },
          "claimCluster": { "x": 490, "y": 220, "width": 620, "height": 320 },
          "challengePrompt": { "x": 8, "y": 704, "width": 1624, "height": 196 }
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
          "centerYPct": 0.54,
          "widthPctOfTableView": 0.78,
          "heightPctOfTableView": 0.48
        },
        "elements": {
          "claimRankBox": {
            "xPct": 0.5,
            "yPct": 0.08,
            "wPct": 0.12,
            "hPct": 0.18
          },
          "claimHandBar": {
            "xPct": 0.5,
            "yPct": 0.52,
            "wPct": 0.42,
            "hPct": 0.3
          },
          "actorAvatarFloat": {
            "xPct": 0.14,
            "yPct": 0.52,
            "wPct": 0.16,
            "hPct": 0.24
          },
          "reactorAvatarFloat": {
            "xPct": 0.86,
            "yPct": 0.52,
            "wPct": 0.16,
            "hPct": 0.24
          },
          "claimTimesBoxLeft": {
            "xPct": 0.26,
            "yPct": 0.52,
            "wPct": 0.07,
            "hPct": 0.13
          },
          "claimCountBoxLeft": {
            "xPct": 0.26,
            "yPct": 0.66,
            "wPct": 0.07,
            "hPct": 0.13
          },
          "claimTimesBoxRight": {
            "xPct": 0.74,
            "yPct": 0.52,
            "wPct": 0.07,
            "hPct": 0.13
          },
          "claimCountBoxRight": {
            "xPct": 0.74,
            "yPct": 0.66,
            "wPct": 0.07,
            "hPct": 0.13
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
          ],
          "varDescriptions": {
            "--layout-app-gap": "Gap between major top-level UI regions.",
            "--layout-app-padding": "Padding between the app frame and the viewport edges.",
            "--layout-sidebar-width": "Fixed width of the right sidebar column.",
            "--layout-sidebar-content-scale": "Global scale multiplier for sidebar text and seat content.",
            "--layout-seat-avatar-size": "Avatar size for non-human seat portraits.",
            "--layout-human-seat-avatar-size": "Avatar size for the human seat portrait.",
            "--layout-cinematic-avatar-size": "Avatar size used in cinematic overlays and focus shots.",
            "--layout-table-view-height": "Preferred height target for the table-view region.",
            "--layout-table-view-min-height": "Minimum table-view height before compression stops.",
            "--layout-table-view-max-height": "Maximum table-view height before capping growth.",
            "--layout-table-dominance-frac": "Target fraction of panel space reserved for table-view.",
            "--layout-action-column-height-scale": "How tall the action column should be relative to context space.",
            "--layout-action-column-max-height": "Absolute cap for the action column height.",
            "--layout-controls-height-scale": "Height multiplier for challenge/controls area.",
            "--layout-controls-max-height": "Maximum controls area height before clipping.",
            "--layout-controls-padding-y": "Vertical padding inside the controls container.",
            "--layout-controls-padding-x": "Horizontal padding inside the controls container.",
            "--layout-controls-gap": "Gap between controls and challenge affordances.",
            "--layout-challenge-font-scale": "Font scale for challenge prompt and related badges.",
            "--layout-challenge-image-scale": "Image/icon scale for challenge prompt visuals.",
            "--layout-challenge-gap-scale": "Spacing scale inside challenge prompt clusters.",
            "--layout-fit-font-scale": "Global fit pass font multiplier for adaptive compression.",
            "--layout-fit-image-scale": "Global fit pass image multiplier for adaptive compression.",
            "--layout-fit-gap-scale": "Global fit pass spacing multiplier for adaptive compression.",
            "--hand-height-frac": "Fractional target height for the hand region.",
            "--layout-hand-height-scale": "Scale multiplier applied to hand container height.",
            "--layout-hand-min-height": "Minimum allowed hand region height.",
            "--layout-hand-max-height": "Maximum allowed hand region height.",
            "--layout-hand-max-row-height": "Maximum height of a single rendered hand row.",
            "--layout-hand-card-min-width": "Minimum playable card width in hand.",
            "--layout-hand-card-max-width": "Maximum playable card width in hand.",
            "--layout-hand-card-min-height": "Minimum playable card height in hand.",
            "--layout-hand-card-max-height": "Maximum playable card height in hand.",
            "--layout-hand-card-gap-min": "Minimum spacing between hand cards.",
            "--layout-hand-card-gap-max": "Maximum spacing between hand cards.",
            "--layout-hand-wrap-padding-y": "Vertical padding around wrapped hand rows.",
            "--layout-hand-wrap-padding-x": "Horizontal padding around wrapped hand rows.",
            "--layout-hand-wrap-gap": "Gap between wrapped hand rows.",
            "--layout-card-base-scale": "Base scale anchor used by all card rendering modes.",
            "--layout-card-hand-scale": "Additional card scale applied in the hand region.",
            "--layout-card-scale": "Final card scale multiplier after mode-specific factors.",
            "--layout-card-table-base-width": "Baseline table card width before scale multipliers.",
            "--layout-card-table-base-height": "Baseline table card height before scale multipliers.",
            "--layout-card-mini-base-width": "Baseline width for compact/claim table cards.",
            "--layout-card-mini-base-height": "Baseline height for compact/claim table cards.",
            "--layout-table-card-auto-scale": "Auto-fit scale for table cards when constrained.",
            "--layout-fit-additive-avatar-zoom": "Extra avatar zoom used by table fit logic.",
            "--layout-card-hit-min-width": "Minimum card hitbox width for interaction.",
            "--layout-card-hit-min-height": "Minimum card hitbox height for interaction.",
            "--layout-card-label-font-base": "Base font size for card labels and glyph text.",
            "--layout-card-label-gap-base": "Baseline gap between card label internals.",
            "--layout-card-label-padding-y-base": "Vertical base padding for card labels.",
            "--layout-card-label-padding-x-base": "Horizontal base padding for card labels.",
            "--layout-card-label-offset-base": "Vertical offset baseline for card label placement.",
            "--layout-card-label-radius-base": "Base border radius for card label chips.",
            "--layout-event-log-max-height": "Maximum event log panel height.",
            "--layout-event-log-padding-y": "Vertical padding within the event log container.",
            "--layout-event-log-padding-x": "Horizontal padding within the event log container.",
            "--layout-event-log-gap": "Gap between event log entries.",
            "--layout-log-item-padding-y": "Vertical padding applied per log item row.",
            "--layout-log-item-padding-x": "Horizontal padding applied per log item row.",
            "--layout-log-max-row-height": "Maximum height for any single log row."
          }
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
