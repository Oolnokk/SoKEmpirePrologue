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
    hand: {
      desiredHeightFrac: __existingGameConfig.layout?.hand?.desiredHeightFrac ?? __legacyGameplayConfig.handDesiredHeightFrac ?? 0.20,
      desiredWidthFrac: __existingGameConfig.layout?.hand?.desiredWidthFrac ?? __legacyGameplayConfig.handDesiredWidthFrac ?? 0.50,
      minHeightPx: __existingGameConfig.layout?.hand?.minHeightPx ?? __legacyGameplayConfig.handMinHeightPx ?? 160,
      maxHeightPx: __existingGameConfig.layout?.hand?.maxHeightPx ?? __legacyGameplayConfig.handMaxHeightPx ?? 360,
    },
    controlsToHandRelationship: __existingGameConfig.layout?.controlsToHandRelationship ?? __legacyGameplayConfig.controlsToHandRelationship ?? 'below',
    allowChallengeOverflow: __existingGameConfig.layout?.allowChallengeOverflow ?? __legacyGameplayConfig.allowChallengeOverflow ?? true,
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
