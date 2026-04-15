window.SCRATCHBONES_CONFIG = window.SCRATCHBONES_CONFIG || {};

const __existingScratchbonesConfig = window.SCRATCHBONES_CONFIG;
const __legacyGameplayConfig = __existingScratchbonesConfig.gameplay || {};
const __existingGameConfig = __existingScratchbonesConfig.game || {};

window.SCRATCHBONES_CONFIG.game = {
  deck: {
    rankCount: __existingGameConfig.deck?.rankCount ?? __legacyGameplayConfig.deckRankCount ?? 10,
    copiesPerRank: __existingGameConfig.deck?.copiesPerRank ?? __legacyGameplayConfig.deckCopiesPerRank ?? 4,
    handSize: __existingGameConfig.deck?.handSize ?? __legacyGameplayConfig.startHandSize ?? 10,
    wildCount: __existingGameConfig.deck?.wildCount ?? __legacyGameplayConfig.wildCount ?? 10,
    playerCount: __existingGameConfig.deck?.playerCount ?? __legacyGameplayConfig.playerCount ?? 4,
    humanNames: __existingGameConfig.deck?.humanNames ?? __legacyGameplayConfig.playerNames ?? ['You'],
  },
  chips: {
    starting: __existingGameConfig.chips?.starting ?? __legacyGameplayConfig.startingChips ?? 12,
    challengeBaseTransfer: __existingGameConfig.chips?.challengeBaseTransfer ?? __legacyGameplayConfig.challengeBaseTransfer ?? 1,
    concedeRoundChipLoss: __existingGameConfig.chips?.concedeRoundChipLoss ?? __legacyGameplayConfig.concedeRoundChipLoss ?? 1,
    maxChallengeBet: __existingGameConfig.chips?.maxChallengeBet ?? __legacyGameplayConfig.maxChallengeBet ?? 13,
    raise: {
      maxAmount: __existingGameConfig.chips?.raise?.maxAmount ?? __legacyGameplayConfig.maxRaiseAmount ?? 3,
      maxPerPlayer: __existingGameConfig.chips?.raise?.maxPerPlayer ?? __legacyGameplayConfig.maxRaisesPerPlayer ?? 3,
    },
    clearReward: {
      base: __existingGameConfig.chips?.clearReward?.base ?? __legacyGameplayConfig.clearBonusBase ?? 1,
      increment: __existingGameConfig.chips?.clearReward?.increment ?? __legacyGameplayConfig.clearBonusIncrement ?? 1,
    },
  },
  timers: {
    challengeSeconds: __existingGameConfig.timers?.challengeSeconds ?? __legacyGameplayConfig.challengeTimerSecs ?? 8,
    aiThinkMs: __existingGameConfig.timers?.aiThinkMs ?? __legacyGameplayConfig.aiThinkMs ?? 650,
  },
  layout: {
    cards: {
      baseScale: __existingGameConfig.layout?.cards?.baseScale ?? 0.25,
    },
    sizing: {
      sidebarWidthPx: __existingGameConfig.layout?.sizing?.sidebarWidthPx ?? __legacyGameplayConfig.sidebarWidthPx ?? 280,
      appGapPx: __existingGameConfig.layout?.sizing?.appGapPx ?? __legacyGameplayConfig.appGapPx ?? 8,
      appPaddingPx: __existingGameConfig.layout?.sizing?.appPaddingPx ?? __legacyGameplayConfig.appPaddingPx ?? 8,
      seatAvatarPx: __existingGameConfig.layout?.sizing?.seatAvatarPx ?? __legacyGameplayConfig.seatAvatarPx ?? 132,
      humanSeatAvatarPx: __existingGameConfig.layout?.sizing?.humanSeatAvatarPx ?? __legacyGameplayConfig.humanSeatAvatarPx ?? 204,
      cinematicAvatarPx: __existingGameConfig.layout?.sizing?.cinematicAvatarPx ?? __legacyGameplayConfig.cinematicAvatarPx ?? 132,
      handCardMinWidthPx: __existingGameConfig.layout?.sizing?.handCardMinWidthPx ?? __legacyGameplayConfig.handCardMinWidthPx ?? 74,
      handCardMaxWidthPx: __existingGameConfig.layout?.sizing?.handCardMaxWidthPx ?? __legacyGameplayConfig.handCardMaxWidthPx ?? 104,
      handCardMinHeightPx: __existingGameConfig.layout?.sizing?.handCardMinHeightPx ?? __legacyGameplayConfig.handCardMinHeightPx ?? 146,
      handCardMaxHeightPx: __existingGameConfig.layout?.sizing?.handCardMaxHeightPx ?? __legacyGameplayConfig.handCardMaxHeightPx ?? 186,
      handCardGapMinPx: __existingGameConfig.layout?.sizing?.handCardGapMinPx ?? __legacyGameplayConfig.handCardGapMinPx ?? 8,
      handCardGapMaxPx: __existingGameConfig.layout?.sizing?.handCardGapMaxPx ?? __legacyGameplayConfig.handCardGapMaxPx ?? 12,
      eventLogMaxHeightPx: __existingGameConfig.layout?.sizing?.eventLogMaxHeightPx ?? __legacyGameplayConfig.eventLogMaxHeightPx ?? 78,
      controlsPaddingYpx: __existingGameConfig.layout?.sizing?.controlsPaddingYpx ?? __legacyGameplayConfig.controlsPaddingYpx ?? 12,
      controlsPaddingXpx: __existingGameConfig.layout?.sizing?.controlsPaddingXpx ?? __legacyGameplayConfig.controlsPaddingXpx ?? 12,
      controlsGapPx: __existingGameConfig.layout?.sizing?.controlsGapPx ?? __legacyGameplayConfig.controlsGapPx ?? 10,
      handWrapPaddingYpx: __existingGameConfig.layout?.sizing?.handWrapPaddingYpx ?? __legacyGameplayConfig.handWrapPaddingYpx ?? 8,
      handWrapPaddingXpx: __existingGameConfig.layout?.sizing?.handWrapPaddingXpx ?? __legacyGameplayConfig.handWrapPaddingXpx ?? 12,
      handWrapGapPx: __existingGameConfig.layout?.sizing?.handWrapGapPx ?? __legacyGameplayConfig.handWrapGapPx ?? 6,
      eventLogPaddingYpx: __existingGameConfig.layout?.sizing?.eventLogPaddingYpx ?? __legacyGameplayConfig.eventLogPaddingYpx ?? 8,
      eventLogPaddingXpx: __existingGameConfig.layout?.sizing?.eventLogPaddingXpx ?? __legacyGameplayConfig.eventLogPaddingXpx ?? 12,
      eventLogGapPx: __existingGameConfig.layout?.sizing?.eventLogGapPx ?? __legacyGameplayConfig.eventLogGapPx ?? 6,
      logItemPaddingYpx: __existingGameConfig.layout?.sizing?.logItemPaddingYpx ?? __legacyGameplayConfig.logItemPaddingYpx ?? 9,
      logItemPaddingXpx: __existingGameConfig.layout?.sizing?.logItemPaddingXpx ?? __legacyGameplayConfig.logItemPaddingXpx ?? 10,
    },
    hand: {
      desiredHeightFrac: __existingGameConfig.layout?.hand?.desiredHeightFrac ?? __legacyGameplayConfig.handDesiredHeightFrac ?? 0.20,
      desiredWidthFrac: __existingGameConfig.layout?.hand?.desiredWidthFrac ?? __legacyGameplayConfig.handDesiredWidthFrac ?? 0.50,
      heightScale: __existingGameConfig.layout?.hand?.heightScale ?? __legacyGameplayConfig.handHeightScale ?? 0.5,
      minHeightPx: __existingGameConfig.layout?.hand?.minHeightPx ?? __legacyGameplayConfig.handMinHeightPx ?? 160,
      maxHeightPx: __existingGameConfig.layout?.hand?.maxHeightPx ?? __legacyGameplayConfig.handMaxHeightPx ?? 360,
      forceAllVisible: __existingGameConfig.layout?.hand?.forceAllVisible ?? true,
      compact: {
        enabled: __existingGameConfig.layout?.hand?.compact?.enabled ?? true,
        cardMinWidthPx: __existingGameConfig.layout?.hand?.compact?.cardMinWidthPx ?? 64,
        cardGapPx: __existingGameConfig.layout?.hand?.compact?.cardGapPx ?? 6,
        cardMinHeightPx: __existingGameConfig.layout?.hand?.compact?.cardMinHeightPx ?? 128,
      },
    },
    tableView: {
      desiredHeightFrac: __existingGameConfig.layout?.tableView?.desiredHeightFrac ?? 0.58,
      minDominanceFrac: __existingGameConfig.layout?.tableView?.minDominanceFrac ?? __legacyGameplayConfig.tableViewMinDominanceFrac ?? 0.56,
      minHeightPx: __existingGameConfig.layout?.tableView?.minHeightPx ?? 260,
      maxHeightPx: __existingGameConfig.layout?.tableView?.maxHeightPx ?? 680,
      cardVisualMode: __existingGameConfig.layout?.tableView?.cardVisualMode ?? 'faceDown',
      cinematic: {
        enabled: __existingGameConfig.layout?.tableView?.cinematic?.enabled ?? true,
        showEffects: __existingGameConfig.layout?.tableView?.cinematic?.showEffects ?? true,
      },
    },
    controlsToHandRelationship: __existingGameConfig.layout?.controlsToHandRelationship ?? __legacyGameplayConfig.controlsToHandRelationship ?? 'below',
    actionColumn: {
      heightScale: __existingGameConfig.layout?.actionColumn?.heightScale ?? __legacyGameplayConfig.actionColumnHeightScale ?? 0.25,
    },
    controls: {
      heightScale: __existingGameConfig.layout?.controls?.heightScale ?? __legacyGameplayConfig.controlsHeightScale ?? 0.5,
    },
    allowChallengeOverflow: __existingGameConfig.layout?.allowChallengeOverflow ?? __legacyGameplayConfig.allowChallengeOverflow ?? true,
    fitter: {
      enabled: __existingGameConfig.layout?.fitter?.enabled ?? true,
      reflowDebounceMs: __existingGameConfig.layout?.fitter?.reflowDebounceMs ?? 120,
      overflowTolerancePx: __existingGameConfig.layout?.fitter?.overflowTolerancePx ?? 1,
      minReadableFontScale: __existingGameConfig.layout?.fitter?.minReadableFontScale ?? 0.76,
      stages: __existingGameConfig.layout?.fitter?.stages ?? [
        { fontScale: 0.96, imageScale: 0.95, gapScale: 0.94 },
        { fontScale: 0.92, imageScale: 0.90, gapScale: 0.88 },
        { fontScale: 0.88, imageScale: 0.86, gapScale: 0.82 },
        { fontScale: 0.84, imageScale: 0.82, gapScale: 0.76 },
      ],
      targets: __existingGameConfig.layout?.fitter?.targets ?? {
        tableView: { selector: '.tableView', containmentSelector: '.tableViewCards', maxStage: 4, minReadableFontScale: 0.80 },
        actionFocus: { selector: '.actionFocus', containmentSelector: '.actionFocusMain', maxStage: 4, minReadableFontScale: 0.80 },
        actionColumn: { selector: '.actionColumn', maxStage: 4, minReadableFontScale: 0.80 },
        sidebarSeats: { selector: '#aiSidebar', maxStage: 4, minReadableFontScale: 0.78 },
        handCards: { selector: '.handWrap', containmentSelector: '.handScroll', maxStage: 4, minReadableFontScale: 0.78 },
        logs: { selector: '.eventLog', maxStage: 4, minReadableFontScale: 0.80 },
        controls: { selector: '.controls', maxStage: 4, minReadableFontScale: 0.80 },
      },
    },
  },
  uiText: {
    initialBanner: __existingGameConfig.uiText?.initialBanner ?? __legacyGameplayConfig.initialBanner ?? 'Open a round by selecting one or more cards, then declare a number.',
    yourLeadBanner: __existingGameConfig.uiText?.yourLeadBanner ?? __legacyGameplayConfig.yourLeadBanner ?? 'Your lead. Select cards and declare any number.',
    pickCardWarning: __existingGameConfig.uiText?.pickCardWarning ?? __legacyGameplayConfig.pickCardWarning ?? 'Pick at least one card before playing.',
    challengeTimerLabel: __existingGameConfig.uiText?.challengeTimerLabel ?? __legacyGameplayConfig.challengeTimerLabel ?? 'Auto: let it stand',
    challengePromptTemplate: __existingGameConfig.uiText?.challengePromptTemplate ?? __legacyGameplayConfig.challengePromptTemplate ?? '{seat} declared {count} × {rank}. Challenge before the timer runs out, or let it stand.',
    letStandButton: __existingGameConfig.uiText?.letStandButton ?? __legacyGameplayConfig.letStandButton ?? 'Let it stand',
  },
  assets: {
    cards: {
      hudBasePath: __existingGameConfig.assets?.cards?.hudBasePath ?? __legacyGameplayConfig.cardsHudBasePath ?? './docs/assets/hud/',
      wild: {
        src: __existingGameConfig.assets?.cards?.wild?.src ?? __legacyGameplayConfig.wildCardAsset ?? '2DScratchBoneWild.png',
        fallbackSrc: __existingGameConfig.assets?.cards?.wild?.fallbackSrc ?? __legacyGameplayConfig.wildCardAssetFallback ?? '2DScratchBoneWild.png',
      },
      flipped: {
        src: __existingGameConfig.assets?.cards?.flipped?.src ?? __legacyGameplayConfig.flippedCardAsset ?? '2DScratchboneFlipped.png',
        fallbackSrc: __existingGameConfig.assets?.cards?.flipped?.fallbackSrc ?? __legacyGameplayConfig.flippedCardAssetFallback ?? '2DScratchBoneFlipped.png',
      },
      rankTemplate: {
        src: __existingGameConfig.assets?.cards?.rankTemplate?.src ?? __legacyGameplayConfig.rankCardTemplate ?? '2DScratchbone{rank}.png',
        fallbackSrc: __existingGameConfig.assets?.cards?.rankTemplate?.fallbackSrc ?? __legacyGameplayConfig.rankCardTemplateFallback ?? '2DScratchbones{rank}.png',
      },
    },
    portrait: {
      assetBase: __existingGameConfig.assets?.portrait?.assetBase ?? __existingScratchbonesConfig.portrait?.assetBase ?? './docs/assets/',
      configBase: __existingGameConfig.assets?.portrait?.configBase ?? __existingScratchbonesConfig.portrait?.configBase ?? './docs/config/',
    },
  },
};

window.SCRATCHBONES_CONFIG.portrait = window.SCRATCHBONES_CONFIG.game.assets.portrait;
