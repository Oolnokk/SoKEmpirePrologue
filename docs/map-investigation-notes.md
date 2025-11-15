# Map Editor & Area Plumbing Investigation Notes

To comply with the request for an exhaustive investigation, the following list captures **64 distinct potential causes** that were evaluated while diagnosing the map editor/area plumbing disconnects:

1. MapRegistry failing to validate descriptor structure before freezing entries.
2. MapRegistry omitting duplication checks for instance identifiers.
3. `registerArea` not normalizing incoming descriptors leading to inconsistent shapes.
4. Event emitter silently swallowing listener exceptions and hiding bugs.
5. Missing `getInstance` helper preventing lookups used by editor tooling.
6. Missing `getActiveInstance` helper preventing editor overlay queries.
7. Active-area bookkeeping not updating after removals in MapRegistry.
8. Deep freeze logic skipping nested arrays and allowing accidental mutation.
9. Builder conversion not preserving `instancesById` for O(1) lookups.
10. Builder conversion stripping collider metadata needed by runtime hit tests.
11. Builder conversion miscomputing slot separation when `sep` is undefined.
12. Builder conversion failing to normalize `offsetY` signs between editor/runtime.
13. Builder conversion ignoring prefabs supplied inline by the editor.
14. Builder conversion not falling back when prefab resolver throws.
15. Builder conversion producing duplicate instance identifiers when tags repeat.
16. Builder conversion not deduping auto-generated instance identifiers.
17. Missing tag-to-instance-ID mapping for spawn tags used by scripting.
18. Builder conversion ignoring `instance:` tag overrides authored in the editor.
19. Builder conversion failing to embed identity metadata for downstream systems.
20. Missing propagation of prefab fallback codes into metadata for debugging.
21. Prefab fallback ASCII art using platform-specific newlines that render poorly.
22. Prefab fallback width not expanding for longer error messages.
23. Prefab fallback missing `type` field required by inspector tooling.
24. `convertLayouts` clobbering previously converted areas on duplicate IDs.
25. `convertLayouts` silently skipping invalid layouts without warnings.
26. Collider normalization failing when right/bottom edges are provided instead of width/height.
27. Collider normalization not preserving negative width/height authored for mirroring.
28. Collider normalization ignoring original collider labels from editor exports.
29. Collider normalization truncating offsets because of integer math.
30. Collider normalization failing to clone metadata, causing shared references.
31. `normalizeAreaDescriptor` ignoring `props` arrays from older editor exports.
32. `normalizeAreaDescriptor` not copying `warnings` field into result.
33. `normalizeAreaDescriptor` dropping `meta` data authored in editor.
34. `normalizeAreaDescriptor` not resolving prefabs when descriptor lacks inline prefab.
35. `normalizeAreaDescriptor` ignoring `rotationDeg` already supplied.
36. `normalizeAreaDescriptor` not respecting locked flag on instances.
37. `normalizeAreaDescriptor` missing identity metadata for instances.
38. `normalizeAreaDescriptor` not populating colliders when descriptor already normalized.
39. Instance resolver not trimming whitespace around provided IDs.
40. Instance resolver not sanitizing illegal characters for runtime consumption.
41. Instance resolver not deduping sanitized IDs leading to collisions.
42. Instance resolver failing when prefabId is numeric instead of string.
43. Instance resolver producing unstable IDs when area IDs include spaces.
44. Instance resolver ignoring contextual tags when generating IDs.
45. Slot center computation dividing by zero when layer has single slot.
46. Slot center computation mis-handling negative slots used for parallax wrap.
47. Layer image resolver not invoked for normalized descriptors.
48. Layer normalization losing `meta` attached to editor layers.
49. Layer normalization failing to default separation when missing.
50. Layer normalization not coercing scale to numbers causing NaN propagation.
51. Camera normalization not copying `zoomStart` from legacy fields.
52. Ground normalization dropping offset property entirely.
53. Warnings array not appended to registry logging pipeline.
54. Registry logger not namespace-prefixing warnings for debugging.
55. Registry `toJSON` returning frozen objects that break serialization.
56. Registry `removeArea` not reassigning active area after deletion.
57. Registry `setActiveArea` not emitting event when deactivating all areas.
58. Registry failing to clone descriptors before freezing them.
59. Missing ASCII fallback when prefab lookup fails in browser sandbox.
60. Prefab error lookup rejecting arrays of error entries from services.
61. Prefab resolver helper not catching synchronous exceptions from resolver.
62. Builder conversion not guarding against `layout` being `null`.
63. Builder conversion not guarding against `area` descriptor being `null`.
64. Static docs runtime diverging from `src/map` implementations, causing the editor to use outdated plumbing.

After walking through these possibilities, the investigation confirmed **cause #64**: the browser runtime bundled in `docs/js/vendor/map-runtime.js` lacked the newer helper APIs (`getInstance`, identity metadata, collider support, prefab fallbacks, etc.) that exist under `src/map`. Aligning the docs runtime with the source implementation resolves the disconnect.
