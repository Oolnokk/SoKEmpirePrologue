# Animation Collider Rendering Investigation

To pinpoint why bones that expose collider metadata disappeared during rendering, I enumerated **64 potential causes** spanning animator state, rendering queues, sprite configuration, and runtime asset plumbing:

1. `renderSprites` short-circuits because `RENDER_DEBUG.showSprites === false` when collider debug UI toggles sprites off.
2. Camera zoom or transform math collapses to zero when collider-bearing limbs extend off-screen, so their sprite quads draw outside the canvas.
3. `ctx.filter` composition in `drawBoneSprite` applies `NaN` scale from cosmetic HSL filters and blocks drawing for those parts.
4. The newly cached `WEAPON_SPRITE_CACHE` never refreshes broken images, so collider-equipped weapons keep a stale `img.__broken` flag.
5. `buildSpriteOverrides` injects malformed cosmetics for the player, overriding limb sprites with missing URLs, causing invisible arms/legs.
6. Pose overrides set `styleOverride.xform.scaleX = 0` for branches carrying attack colliders, collapsing their width to zero pixels.
7. Walk-cycle amplitude now reaches zero during attack transitions, so `updatePoses` never updates the limb bones used by collider renderers.
8. `updateFighterColliders` mutates the shared bone objects by accident, zeroing their `len` so `drawBoneSprite` computes zero-height quads.
9. `renderAll` prunes bones with undefined angles after collider sampling, so sprites never see those entries.
10. The new `setMirrorForPart` flip scheduling leaves mirror flags `true`, and the branch mirroring math double flips limbs off screen.
11. `renderSprites` queue sorts by tag, but collider layers reuse the `'HITBOX'` tag, so weapon sprites always draw behind the fallback silhouette and look hidden.
12. Weapon sprite entries lack `styleOverride`, and the default anchor of `mid` causes them to intersect the torso; when `ctx.save()` fails, the draw aborts.
13. `ensureFighterSprites` converts `rotDeg` to `alignRad` but writes `undefined`, so limbs reliant on that conversion (the collider arms) rotate 90° off canvas.
14. `applyAnimOptions` merges runtime transforms that include `scaleX = Infinity` due to collider-based overrides, blowing up the draw matrix.
15. `drawBoneSprite` rejects unloaded images because collider metadata triggers the load order before the asset manifest populates caches.
16. `renderState.entities` excludes fighters with `attack.colliders` active because their IDs are filtered out by `activeColliderIds` bookkeeping.
17. `renderAll`'s fallback silhouette occludes the collider limbs because it draws after sprites due to z-order misconfiguration.
18. Cosmetic layers for the torso add `globalCompositeOperation = 'destination-out'`, erasing any overlapping limb quads (hands/feet with colliders).
19. `weaponConfig.sprite.layers` reference anchor bones that changed IDs (e.g., `weapon:blade`), so the renderer cannot look them up.
20. `buildWeaponBones` clamps lengths to zero when `rig.base.anchor` resolves to null, so weapon sprites have no size to draw.
21. `collectWeaponColliderKeys` filters out collider IDs unless they match preset tags, so attack logic never marks the weapon as active, and downstream render code hides the limb.
22. Collider center calculations run before inverse kinematics settle, leaving them at `{x: 0, y: 0}`, tripping the debugging `debugger;` statement and freezing rendering.
23. `ctx.drawImage` throws because the browser disallows cross-origin weapon sprites, stopping the frame before the collider limbs render.
24. Physics ragdoll blending overwrites `F.jointAngles` with `undefined` for limbs being sampled for colliders.
25. `withBranchMirror` fails to restore the canvas state after mirroring collider limbs, so subsequent draws reuse the mirrored matrix and cancel out the part.
26. `partitionCosmeticLayers` misclassifies gloves/boots with collider metadata as appearance layers and draws them twice, exhausting the draw queue early.
27. `resolveCosmeticMirror` reads from `rig` before weapon bones are inserted, so it passes `undefined` to `withBranchMirror`, skipping drawing altogether.
28. `renderSprites` only iterates torso/arms/legs and never enqueues the dynamic weapon branch that now carries colliders.
29. Weapon sprite definitions live outside the asset manifest, so bundlers strip them and the runtime can't `load()` the URL.
30. `renderAll`’s entity builder forgets to copy `fighter.weapon`, so sprite rendering has no idea which weapon assets to use.
31. The `weaponKey` chosen in animator differs from the renderer’s key, producing bones but not matching sprite metadata.
32. Weapon bones are added to `G.ANCHORS_OBJ`, but `getBones` falls back to the `player` anchors that lack those weapon entries.
33. NPC fighters never have `renderProfile` assigned, so weapon sprites look up undefined cosmetic overrides and abort.
34. `applyWeaponToRenderProfile` resets `renderProfile.character.weapon` but not `renderProfile.weapon`, leaving the runtime weapon undefined.
35. Canvas `ctx.save()` calls exceed browser limits because collider draw passes add too many saves per frame, leading to silent draw failures.
36. Collider debugging overlays in `render.js` leave the context clipped after drawing attack trails, so sprite quads get clipped away.
37. `renderSprites` obtains `animStyle` from `G.ANIM_STYLE_OVERRIDES`, and collider animations inject NaN transforms, skipping draws.
38. `drawBoneSprite` rejects bones without `bone.len`, and weapon bones rely on `length` instead of `len`, leaving that property undefined.
39. `renderSprites` looks for `weaponConfig.sprite`, but weapon definitions nest sprites inside `weaponConfig.visual.sprite`, so it never finds them.
40. Collider metadata adds `bone.colliders` objects containing circular references, breaking `structuredClone` used elsewhere and leaving bones undefined at render time.
41. Attack presets toggle `RENDER.hideSprites` when colliders activate to visualize hitboxes, unintentionally disabling sprite rendering permanently.
42. `renderSprites` renders limbs before `renderAll` updates `G.ANCHORS_OBJ`, so the limbs use stale positions that overlap the camera clip and look invisible.
43. New easing functions in animator overshoot shoulder angles past ±π, so `Math.cos`/`Math.sin` produce NaNs that propagate into sprite positions.
44. Collider-equipped limbs mark `bone.hidden = true` somewhere else to avoid double-drawing, and sprite renderer respects that hidden flag.
45. NPC animation updates happen on alternating frames, so `entity.bones` is undefined on skipped frames, causing sprites (especially weapon limbs) to disappear intermittently.
46. Collider IDs include lowercase keys, but the renderer only enqueues uppercase tags and never draws those limbs.
47. `renderSprites` fails to reset `ctx.filter` after drawing untinted overlays, so the next limb draws with `opacity:0`.
48. Hand/foot sprites rely on `cosmeticTagFor` entries, but the tag map lost those keys when collider metadata was introduced, preventing enqueuing.
49. `drawBoneSprite` tries to warp sprites using `boneInfluences`, but collider data provides empty bones, resulting in skipped warps/draws.
50. `renderSprites` fetches `bodyColors` overrides per fighter, but collider-carrying limbs reference missing palette letters and throw, aborting the draw loop.
51. The fallback silhouette draws after sprites due to event ordering, covering up the collider limbs entirely.
52. Weapon sprite `styleOverride.xform` sets `scaleX = 0` when colliders deactivate to hide blades, but it never resets, so weapons stay invisible.
53. Collider activation toggles `CONFIG.render.showSprites` internally for debugging, and that flag remains false in subsequent frames.
54. NPC loadouts equip weapons not listed in `CONFIG.weapons`, so sprite lookups fail silently when colliders reference those weapon IDs.
55. The animation editor exports collider IDs with spaces, and the runtime fails to trim them before matching sprite layers, leaving them unrendered.
56. Newly added breathing offsets move the shoulders differently on left/right, so mirrored weapons no longer align with their collider bones and slip off screen.
57. `ctx.translate(centerX * 2, 0); ctx.scale(-1, 1);` uses `centerX` from the hitbox, but collider limbs extend past that pivot and get flipped outside the viewport.
58. Renderer draws clothing layers for boots/gloves after the base limb, but collider metadata also registers those clothing layers as weapons, leading to double mirroring and cancellation.
59. Weapon sprites rely on `window.CONFIG.knockback.currentWeapon`, and that value never updates when the editor swaps loadout weapons.
60. Collider-bearing limbs rely on `withBranchMirror` to orient correctly, but attack poses call `setMirrorForPart` with `'ALL'`, flipping entire sprites backwards and effectively hiding some limbs.
61. Weapon sprite definitions omit `alignDeg`, so `drawBoneSprite` defaults to `alignRad = 0`, which rotates blades into the camera plane and makes them appear missing.
62. `renderSprites` sorts queue entries by `z`, but weapon tags default to `undefined`, so `zOf` returns a high sentinel and the weapon draws behind the ground.
63. Animator writes `F.anim.weapon.state.bones` but render loop uses a cloned copy lacking `start/end` coordinates, so weapon sprites get no anchor positions.
64. Sprite rendering only checks `entity.profile` to determine the equipped weapon. NPCs and runtime loadouts often set `fighter.weapon` without updating the profile, so weapon sprites (the very parts holding the new colliders) never look up their assets and fail to render.

After testing each line of inquiry, **cause #64** proved real: the sprite renderer ignored the fighter’s runtime `weapon` selection, so the weapon bones generated by the new animation system never gained their matching sprites.

## Remediation options considered before coding

1. **Synchronize render profiles whenever a fighter’s `weapon` changes.** Pros: keeps all consumers aligned; cons: risks stale UI templates and requires touching every loadout mutation site.
2. **Thread the resolved weapon key through `renderAll()` entities.** Pros: explicit data flow; cons: adds more per-frame plumbing and duplicates selection logic already embedded in `renderSprites`.
3. **Teach `renderSprites()` to fall back to runtime sources (fighter state, selection UI, and config) when determining `activeWeaponKey`.** Pros: localized change; cons: renderer must trim/validate strings.

I implemented option 3 so weapon bones with colliders always locate their sprite definitions, even when render profiles lag behind runtime selections. The fix includes the live fighter weapon (and other runtime fallbacks) when resolving `activeWeaponKey` in `renderSprites`.
