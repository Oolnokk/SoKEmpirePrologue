# NPC attack trail diagnostics

## Candidate remediation approaches considered before implementation
1. **Drive sampling from the gameplay update loop.** Call `recordNpcAttackTrailSample` every frame for each NPC with `dt` from `updateNpcMovement`, letting it consume cached limb positions from `colliders.js`. This would keep sampling logic centralized in `npc.js` alongside other per-frame visual bookkeeping.
2. **Trigger sampling from the render pipeline.** Extend `render.js` so that, after `updateFighterColliders` runs for an NPC, it immediately emits a sample by calling a new helper that reuses the freshly computed bone data. This would give perfectly up-to-date coordinates at the cost of tying the visual effect to render timing rather than simulation timing.
3. **Embed sampling inside the combat strike phases.** Update the combat timeline helpers (e.g., `updateFighterAttackState`) to push collider keys and world positions into a shared queue whenever a strike phase becomes active, then let `npc.js` convert that queue into trail samples. This would make the effect aware of preset metadata but would require threading visual state through combat internals.

## Potential causes reviewed (minimum of 64)
1. `recordNpcAttackTrailSample` (docs/js/npc.js) is never called, so the trail data structure might stay empty forever.
2. `attackTrail.enabled` defaults to `true` but could be toggled off by corrupted NPC visual state, preventing sampling entirely.
3. `attack.active` might rarely be `true` for NPCs if `startNpcQuickAttack` fails to set it, blocking the sampling guard.
4. `attack.currentActiveKeys` is reset to `[]` in several `ensureAttackState` paths, so the sampling routine might never see any collider keys.
5. `getPresetActiveColliders` only knows about `KICK`, `PUNCH`, and `SLAM` prefixes, so presets with different names never enable limb colliders.
6. NPC attack presets may rely on weapon-specific collider IDs, but the NPC attack logic never surfaces `weapon:` keys into `currentActiveKeys`.
7. `getFighterColliders` only tracks `handL`, `handR`, `footL`, and `footR`, meaning weapon collider keys resolve to `undefined` positions.
8. `updateFighterColliders` runs inside `render.js`; if NPC rendering ever skips a frame, their collider cache never updates and sampling returns stale positions near the origin.
9. `fighter.id` might not match the ID stored in `perFighter`, so `getFighterColliders` could look up the wrong entry and fall back to null centers.
10. `attackTrail.interval` defaults to `0.02`. If the update loop runs slower than 50 FPS, the timer might never accumulate enough to emit a sample, leaving old data visible.
11. `attackTrail.maxLength` is only `6`, so a burst of off-center samples might immediately get trimmed, leaving a single remaining entry at the center.
12. `fadeNpcAttackTrailEntry` subtracts `dt * 4` from `alpha`, so any hitch over 250 ms can zero-out every non-center sample before a new one arrives.
13. `resolveWeaponColliderPoint` returns `null` whenever `fighter.anim.weapon.state` is missing, forcing the sampler to skip weapon keys entirely.
14. `fighter.anim.weapon.state.bones` might not include collider metadata if `ensureAnimState` resets attachments mid-frame.
15. `fighter.attack.currentPhase` could be `null` due to sequencing bugs, preventing the strike-phase fallback inside `recordNpcAttackTrailSample`.
16. `attack.context?.preset` might not match the NPC preset name, so the fallback to `getPresetActiveColliders` retrieves an empty set.
17. `ensureNpcVisualState` may clone `ATTACK_TRAIL_TEMPLATE` without copying nested arrays correctly, leaving shared references that overwrite one another.
18. `attackTrail.colliders[key]` is filtered in place during fading, so iterating while modifying could skip samples and bias toward the first (center) entry.
19. `sourceColliders?.[key]` might be `undefined` when `getFighterColliders` returns `null` for hands/feet because `updateFighterColliders` is never seeded with `bones.center` data.
20. When `pos` is undefined and `key` is not weapon-prefixed, the sampler simply continues, potentially skipping every key and leaving stale data.
21. `radius` defaults to `12` when missing, so even if positions are correct, very small radii can make off-center samples appear invisible.
22. `attack.currentActiveKeys` might contain lowercase IDs, but the collider store uses camelCase names, so lookups fail and fall back to center.
23. NPCs spawned without `state.id` default to `'npc'`, causing multiple fighters to share the same trail buffer and overwrite each other's samples.
24. `ensureNpcMovement` only fades attack trails when an NPC is dead, so old center samples could linger indefinitely once combat stops.
25. `recordNpcAttackTrailSample` resets `attackTrail.timer` to `0` even if no valid keys were sampled, slowing down future attempts.
26. The `colliders` argument defaults to `getFighterColliders(fighterId)`; if the caller passes a stale object, the sampler never fetches updated data.
27. `getFighterColliders` clones points but not radii when they are `0`, so zero-sized radii may drop entirely and render nothing when off-center.
28. `ensureNpcVisualState` sets `attackTrail.colliders.handL = []` etc. only once; if an NPC equips a weapon and needs new keys, the arrays never appear.
29. Weapon collider IDs stored in config (e.g., `colliderA`) might not match the runtime IDs (`weapon_0_collider_0`), preventing `resolveWeaponColliderPoint` from ever matching.
30. `attackTrail.colliders ||= {}` occurs after the `keys` guard, so in frames where keys are empty, `colliders` could remain `undefined` and renderers skip drawing.
31. `fadeNpcAttackTrailEntry` removes a key entirely if its list becomes empty, so subsequent render passes might not iterate over the expected keys.
32. `updateNpcMovement` calls `updateDashTrail` twice (lines 1131 and 1428), suggesting mismatched visual updates that could similarly skip attack trail upkeep entirely.
33. NPC attack presets reset `attack.currentActiveKeys` to `[]` when exiting Strike, so any lingering Recoil frames show only the default center positions.
34. `startNpcQuickAttack` forces `attack.isHoldRelease = true`, which may trigger logic elsewhere that clears collider keys mid-strike.
35. `ensureNpcAggressionState` might flip `state.mode` to `'idle'`, causing `updateNpcMovement` to skip lunge updates and leaving attack phases desynced from collider sampling.
36. `updateNpcAbilityDirector` can mark an NPC as `isBusy`, preventing new attacks from starting and leaving stale trail positions visible.
37. `resolveFighterBodyCollisions` might push NPC positions suddenly, but `getFighterColliders` is still based on pre-resolution bones, so samples appear at the old center.
38. If `window.CONFIG.durations` defines zero-length strike phases, `attack.currentPhase` may never equal `'Strike'`, so sampling never runs.
39. When `fighter.attack.active` becomes `false` before Recoil finishes, `recordNpcAttackTrailSample` won't fire but the renderer still shows the prior center entry.
40. `ensureNpcAttackState` doesn't copy `attack.context`, so the sampler cannot access `context?.preset` for fallback keys.
41. `attack.currentActiveKeys` stores references to arrays returned from `getPresetActiveColliders`, so later mutations to the preset array might zero-out entries globally.
42. NPC combos call `getPresetActiveColliders(attack.preset)` every frame during Strike, potentially creating new arrays and losing weapon-specific data.
43. `recordNpcAttackTrailSample` multiplies nothing by `dt` when computing positions, so large timesteps don't produce more samples and may skip entire swing arcs.
44. `state.recovery` transitions call `applyNpcPoseForCurrentPhase` without updating attack visuals, so colliders snap back to the origin mid-animation.
45. `updateFighterPhysics` might clamp velocities and positions, but collider caches still reflect pre-clamp transforms, causing sampling to capture the center before lunge corrections.
46. If `G.FIGHTERS.player` is undefined, NPC lunge targeting falls back to their own position, so hand/foot angles might not move, leaving the trail at the center.
47. `npc.aiInput` may toggle `buttonA` mid-frame, interrupting `combat.slotDown` and preventing Strike phases from actually firing collider keys.
48. The `attackTrail` template's `colliders` object is reused via JSON clone, so deep copies should occur, but if `clone` fails (structuredClone not available), references could be shared and overwritten.
49. `ensureGameState` might lazily initialize `GAME.NPC` after sampling, so early frames store samples under the wrong container and vanish.
50. `fadeNpcAttackTrailEntry` is called inside `recordNpcAttackTrailSample` even during active strikes, so slow frames may immediately erase the sample that was just recorded.
51. The renderer iterates `baseKeys = ['handL', 'handR', 'footL', 'footR']` even if those arrays don't exist, so `undefined` lists short-circuit drawing and hide weapon samples.
52. `attackTrail.timer` accumulates per NPC visual entry, but `updateNpcMovement` recreates entries when re-registering fighters, resetting timers mid-strike.
53. `state.cooldown` transitions might mark `attack.active = false` while `attack.currentActiveKeys` still reference weapon IDs, causing `record` to skip sampling even though the weapon is mid-swing.
54. `recordNpcAttackTrailSample` reads `Number.isFinite(radius)` to validate the collider radius; if `getFighterColliders` stores radii as strings (e.g., `'18'`), they are rejected and default to 12.
55. `resolveWeaponColliderPoint` computes a radius from `collider.width` and `collider.height`, but those values could be zero for point colliders, yielding radii too small to see.
56. `ensureNpcMovement` reuses `visuals` entries across respawns, so stale samples from a previous fight might still be visible at the center before new data arrives.
57. `state.isDead` triggers an early return before `recordNpcAttackTrailSample` can run, so any final swings never emit off-center samples and the renderer keeps the last center entry.
58. `attackTrail.colliders[key]` uses `list.unshift`, so the newest sample is at index 0; if renderers iterate from tail to head, old center samples might appear stronger because their alpha has not yet decayed.
59. `getNpcAttackTrail` clones references to the trail objects, so UI overlays might mutate them and inadvertently reset samples to center positions.
60. `resolveWeaponColliderPoint` expects IDs like `weapon:colliderA`, but combat may emit keys without the `weapon:` prefix, so the lookup never runs and default limb keys remain at the origin.
61. `attack.currentActiveKeys` might include preset names like `'PUNCH_A'` instead of collider IDs because `ensureAttackState` wasn't updated for new content.
62. NPC AI routines (e.g., lines 889-912) can reset attack state mid-strike, wiping `currentActiveKeys` and forcing the sampler to reuse whatever center point was last recorded.
63. `applyNpcPoseForCurrentPhase` may fail to update bone rotations when transitions are fast, so `updateFighterColliders` continues to see neutral poses centered on the torso.
64. `ensureNpcAbilityDirector` could queue multiple abilities, and switching presets mid-frame might reset `attackTrail.colliders` to empty arrays, leaving only the previous center sample visible.
