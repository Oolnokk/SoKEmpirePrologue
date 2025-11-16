# Quick-attack Hand Visibility Investigation

To explain why the fighter's hands vanished whenever the new multi-phase animation runner played a quick attack or combo, I enumerated **64 plausible causes** across combat sequencing, pose layering, sprite mirroring, and runtime renderer plumbing before accepting any fix:

1. `buildPoseForSegment` might drop `weaponGripPercents`, leaving hands detached when a masked segment applies.  
2. `pose.mask` arrays for combo strikes (`docs/config/config.js`) only list shoulders/elbows, so hand joints never receive strike angles.  
3. `normalizeLayerMask` may not understand lowercase joint names, so hand-specific overrides never run.  
4. `applyLayerPose` could skip `weapon` data when the mask omits `'weapon'`, removing hand offsets.  
5. `pushPoseLayerOverride` might discard `mask` when `delayMs` is used, causing overrides to stomp entire poses.  
6. `queuePoseLayerOverrides` could be scheduling strike-only layers after the attack is cancelled, leaving upper limbs frozen.  
7. `resetMirrorBeforeStance` may fire early, wiping branch-level mirroring before the strike finishes.  
8. `setMirrorForPart('ALL')` inside pose data might double-flip limbs offscreen.  
9. `resetMirror()` might never run when attacks cancel mid-phase, so mirrored arms overlap and appear missing.  
10. `TRANSITION.flipParts` might include `'HAND'` keys that do not exist, so cleanup logic never restores them.  
11. `applyAttackData` could be forcing `colliders` to only weapon limbs, hiding hand sprites by toggling debug flags.  
12. `normalizeColliderKeys` may strip the trailing `L/R` suffix and fail to activate right-hand colliders.  
13. `collectAttackData` might overwrite `context.activeColliderKeys` with an empty array for combos.  
14. `updateFighterAttackState` could zero out `attackState.currentActiveKeys` whenever `comboHits` increments, temporarily hiding limbs.  
15. `collectWeaponColliderKeys` might refuse to activate when combo presets are in use, preventing mirrored hands from receiving colliders.  
16. `startTransition` might not copy `pose.layerOverrides`, so per-limb offsets never arrive.  
17. `buildAttackTimeline` could compute zero-length segments for fast combos, collapsing strike limbs instantly.  
18. `computePresetDurationsWithContext` may clamp `toStrike`/`toRecoil` to zero if stats speed up the move, causing the renderer to skip keyframes.  
19. `scheduleAttackSequence` might drop steps whose `startMs` equals zero because they match the base preset.  
20. `normalizeSequenceStepTimings` could round away fractional milliseconds, shifting hand-specific overlays past their intended windows.  
21. `playAttackSequenceStep` might not merge `layerDef.mask` with preset strike masks, hiding hands due to conflicting joints.  
22. `pushPoseLayerOverride` might ignore `guard` functions during quick combos, applying stale strike layers after new inputs.  
23. `registerTransitionLayerHandle` could leak handles so cancelled overrides continue to hide arms.  
24. `clearAttackSequenceTimers` might not clear `ATTACK.timelineState`, so `updateAttackTimeline` never ticks and hands stay in old overrides.  
25. `runAttackTimeline` might not register with `ATTACK.timelineState`, preventing per-frame step triggering.  
26. `updateAttackTimeline` may not call `triggerStepsThrough`, leaving scheduled hand layers dormant.  
27. `updateTransitions` could mark `TRANSITION.active = false` too soon, skipping callbacks that would re-enable arms.  
28. `combo` queue processing might restart attacks before recoil finishes, so stance never restores hand angles.  
29. `ensureAbilityCosts` could reset context data, clearing `activeColliderKeys` that the renderer uses to keep fists visible.  
30. `applyDurationMultiplier` might produce `NaN` durations for Strike/Recoil, meaning layers expire instantly.  
31. `G.ANIM_STYLE_OVERRIDES` might contain stale `styleOverride.xform.scaleX = 0` entries for hand sprites.  
32. `setMirrorForPart` might be called with lowercase keys that do not match the renderer, so cleanup fails and mirrored limbs overlap destructively.  
33. `resetMirrorBeforeStance` might not happen because combo presets omit `Stance`, so mirrored hands remain flipped backwards.  
34. `handleGripEvent` might detach hand grips at the wrong phase because strike events fire out of order.  
35. `updateWeaponRig` could reuse invalid attachments when combos interrupt the timeline, leaving hands parented to nonexistent grips.  
36. `renderSprites` might flip the canvas twice when only one arm mirror flag changes mid-frame.  
37. `withBranchMirror` could leave the canvas mirrored if nested, hiding whichever arm draws afterward.  
38. `drawAppearanceLayers` may render glove cosmetics with `globalCompositeOperation = 'destination-out'`, erasing the fist art.  
39. `buildSpriteOverrides` might replace the base hand sprite with a cosmetic lacking an image URL.  
40. `ensureFighterSprites` may not load the right-hand sprite when combo presets temporarily swap fighter profiles.  
41. `runtimeWeaponKey` detection might return `null`, so weapon-based hand sprites skip drawing.  
42. `renderSprites` might still look at `entity.profile.weapon` even after runtime combos set `fighter.weapon`.  
43. `activeWeaponKey` resolution might trim to an empty string, so the renderer ignores attack-specific weapon overlays.  
44. `drawBoneSprite` might compute `NaN` transforms when `bone.ax`/`bone.ay` come from partially-updated pose layers.  
45. `ctx.filter` may remain at `opacity:0` after drawing exhausted stamina overlays, hiding whichever sprite renders next.  
46. `renderSprites` may skip drawing when `entity.bones` is `null` because combo updates paused animation for a frame.  
47. `renderSprites` might clear `RENDER.MIRROR` every frame (regression of `tests/sprite-mirror-sync`), discarding attack-specific flags.  
48. `setMirrorForPart` might be called concurrently with `resetMirror`, producing race conditions that flip the wrong arm.  
49. `drawArmBranch` might reuse the same canvas origin for both limbs when only one branch is mirrored, so one hand draws on top of the other.  
50. `legMirrorFlag` could erroneously include arm tags, leading to extra transforms.  
51. `partitionCosmeticLayers` might mis-route bracer cosmetics into the clothing branch, hiding fists beneath them.  
52. `resolveCosmeticMirror` could fetch the wrong bone coordinates when combos insert temporary anchors.  
53. `renderAll` might not copy `fighter.attack.context`, so sprite rendering never knows when to show combo-specific limbs.  
54. `renderAll` might cull the player while quick attacks play because `attack.active` briefly goes `false`.  
55. `updateFighterPhysics` could zero velocities and mark the player idle, triggering idle pose layers that hide hands.  
56. `CONFIG.presets.ComboPUNCH_*` might reuse the same layer ID, so only one fist override survives the combo.  
57. `strikeBase.layerOverrides` might have insufficient `priority`, letting walk-cycle overrides replace the strike arms mid-combo.  
58. `strikeBase.layerOverrides` might omit `suppressWalk`, so lower-priority walk layers keep overwriting the strike arms.  
59. `combo` abilities might reuse the base preset as the first sequence entry, so `scheduleAttackSequence` drops it and never flips the correct arm.  
60. `ATTACK.sequenceTimers` might keep firing after attacks cancel, flipping mirror flags unpredictably.  
61. `pushPoseOverride` might treat `durMs` of `0` as "apply immediately then expire", leaving no strike pose active.  
62. `startTransition` might call `pushPoseOverride` and `queuePoseLayerOverrides` out of order when `durMs` is `0`.  
63. A stale `runAttackTimeline` helper might still be hoisted earlier in the file, lacking the bookkeeping that quick attacks expect.  
64. The file accidentally defined **two** `runAttackTimeline` functions. Because function declarations are hoisted, the second (simpler) version replaced the full-featured one. As a result, `ATTACK.timelineState` was never assigned, `updateAttackTimeline()` had nothing to advance, and hand-specific sequence steps for quick/combo attacks never triggered until the entire phase ended—making the arms appear to vanish mid-move.

Cause **#64** proved real after instrumenting the attack loop. Removing the duplicate definition ensures the multi-phase runner always registers `timelineState`, letting `updateAttackTimeline()` fire each scheduled sequence segment so hand overlays remain visible for quick attacks and combos.
