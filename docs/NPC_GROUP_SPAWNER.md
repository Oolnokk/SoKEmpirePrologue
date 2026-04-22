# NPC Group Spawner

A comprehensive system for spawning groups of NPCs with procedurally generated names based on cultural naming rules.

## Features

- ✅ **Group-based NPC spawning** from spawn points with group metadata
- ✅ **Procedural name generation** using culture-specific naming systems (Mao-ao + Kenkari)
- ✅ **Deterministic generation** - same spawner always produces same names
- ✅ **Family relationships** - support for inherited surnames and marriage rules
- ✅ **Debug controls** - toggle logging for names, patterns, and generation steps
- ✅ **Character template integration** - works with existing character template system
- ✅ **Configurable spawn timing** - per-member delay ranges with optional scheduled callbacks

## Files

### Core Modules

- **`docs/js/npc-group-spawner.js`** - Main spawner logic
  - `spawnNpcGroup(spawner, options)` - Spawn a single group
  - `spawnAllGroups(spawnService, areaId)` - Spawn all groups in an area
  - `generateNpcName(options)` - Generate a single name

- **`docs/js/namegen.js`** - Name generation engine
  - Mao-ao and Kenkari culture implementations
  - Birth rules (surname inheritance, initial matching)
  - Marriage rules (surname adoption, initial prefixing)

- **`src/spawn/SpawnService.js`** - Spawn point management (existing)
- **`src/map/groupLibrary.js`** - Group metadata normalization (existing)

### Configuration

- **`docs/config/config.js`** - Debug settings added:
  ```javascript
  window.CONFIG.debug.npcGroupSpawner = {
    enabled: false,      // Enable general debug logging
    logNames: false,     // Log all generated names
    debugNames: false,   // Enable detailed name generation debug
  };
  ```
  - `CONFIG.mapEntities.groupSpawner.delayRangeSeconds` controls the default spawn cadence (defaults to `[0.75, 1.25]`).

### Test Files

- **`docs/test-npc-group-spawner.html`** - Interactive test page
  - Toggle debug settings
  - Spawn test groups
  - View generated names with details

## Usage

### Basic Spawning

```javascript
import { spawnNpcGroup } from './js/npc-group-spawner.js';

// Get a spawner from the spawn service
const spawner = spawnService.getSpawner('area_id', 'spawner_id');

// Spawn the group
const fighters = spawnNpcGroup(spawner);

// Each fighter has:
// - npcName: "Kayji Kayji" (full generated name)
// - nameParts: { first: "Kayji", last: "Kayji" }
// - gender: "male" | "female"
// - culture: "mao_ao"
// - groupId, groupName, spawnerId, etc.
```

### Spawn Timing & Callbacks

`spawnNpcGroup` assigns each fighter a cumulative delay to support staggered spawning:

- Per-member ranges can be set via `spawnDelayRangeSeconds` (array) or `spawnDelaySeconds` (single value) on the member, or on the group meta.
- Defaults come from `CONFIG.mapEntities.groupSpawner.delayRangeSeconds`.
- Each fighter includes `spawnDelayMs`/`spawnDelaySeconds` and `meta.memberDelaySeconds` for the per-member roll.
- Provide an `onSpawn` callback to receive fighters in real time:

```javascript
spawnNpcGroup(spawner, {
  onSpawn: (fighter) => spawnIntoWorld(fighter),
});
```

If no callback is provided, the returned array still contains delay metadata so callers can schedule their own spawning.

### Spawn All Groups in Area

```javascript
import { spawnAllGroups } from './js/npc-group-spawner.js';

const allFighters = spawnAllGroups(spawnService, 'test_area');
console.log(`Spawned ${allFighters.length} NPCs total`);
```

### Enable Debug Mode

```javascript
// Enable debug logging
window.CONFIG.debug.npcGroupSpawner.enabled = true;

// Log all generated names
window.CONFIG.debug.npcGroupSpawner.logNames = true;

// Show detailed name generation steps
window.CONFIG.debug.npcGroupSpawner.debugNames = true;
```

## Group Configuration

Groups are defined in the group library and attached to spawners:

```javascript
const groupLibrary = {
  city_guard_patrol: {
    id: 'city_guard_patrol',
    name: 'City Watch Patrol',
    faction: 'citywatch',
    members: [
      { templateId: 'citywatch_watchman', count: 3 }
    ],
    meta: {
      culture: 'mao_ao',           // Optional: specify culture
      familySurname: 'Kayao'       // Optional: shared family surname
    }
  }
};

const spawners = [
  {
    spawnerId: 'spawn_west_gate',
    type: 'npc',
    groupId: 'city_guard_patrol',
    x: 10, y: 0
  }
];
```

## Fighter Culture & Gender Tags

Names are automatically generated based on the fighter's culture and gender, which are encoded in the fighter name using suffixes:

- **`_m` / `_male`** = Male (e.g., `Mao-ao_m`, `Kenkari_male`)
- **`_f` / `_female`** = Female (e.g., `Mao-ao_f`, `Kenkari_female`)

The prefix determines the culture (e.g., `Mao-ao` → `mao_ao` culture).

### Example Fighter Names

```javascript
{
  fighter: "Mao-ao_m"   // Male Mao-ao culture → generates names like "Kayji Kayji"
  fighter: "Mao-ao_f"   // Female Mao-ao culture → generates names like "A'eyma Kayao"
}
```

### Character Template Example

```javascript
window.CONFIG.characterTemplates = {
  citywatch_guard_male: {
    label: 'City Watch Guard (Male)',
    defaults: {
      fighter: 'Mao-ao_m',  // Will generate male Mao-ao names
      stats: { baseline: 10, strength: 12 }
    }
  },
  citywatch_guard_female: {
    label: 'City Watch Guard (Female)',
    defaults: {
      fighter: 'Mao-ao_f',  // Will generate female Mao-ao names
      stats: { baseline: 10, agility: 12 }
    }
  }
};
```

## Name Generation

### Mao-ao Culture Rules

**Phonology:**
- Consonants: w, r, t, y, p, s, f, g, h, b, n, m, k
- Clusters: sh, zh, ng, hy
- Vowels: a, e, i, o, u
- Diphthongs: ai, ao, ey (not used with consonant endings)

**Structure:**
- First names: exactly 3 syllables
- Last names: exactly 2 syllables
- Syllable patterns: CV, CVn, CVng, CVr (males), V, Vn, Vng (female first syllable only)
- Vowel hiatus marked with apostrophe: "Ra'ao"

**Rules:**
1. **Birth:** Children inherit parent's surname
2. **Male birth:** First name initial matches surname initial (e.g., Kayji Kayji)
3. **Marriage:** Wife takes husband's surname
4. **Marriage:** Wife's first name prefixed with husband's initial (e.g., Aona → Kaona)

### Example Names

**Male:**
- Kayji Kayji
- Ro'urjo Ro'ur
- Shimaji Shima

**Female:**
- A'eynga Kayao (married to a K-named husband)

### Kenkari Culture Rules

Kenkari names use dedicated phonology and patronymic surname rules implemented in `namegen.js` (for example, `Kenkari_m` / `Kenkari_f` resolve to the `kenkari` culture).
- Oshinga Oshim
- E'ira Hoshey

## Debug Output

When `debugNames: true`, you'll see detailed generation steps:

```javascript
{
  "label": "firstName.syllableCount",
  "data": { "count": 3, "mode": "exact" }
},
{
  "label": "firstName.first.pattern",
  "data": "CV"
},
{
  "label": "firstName.first.vowelChoice",
  "data": {
    "nucleus": "a",
    "excludedDiphthongs": false,
    "forcedVowels": null
  }
}
// ... more steps
```

## Testing

1. Open `docs/test-npc-group-spawner.html` in a browser
2. Toggle debug checkboxes
3. Click "Spawn City Watch Patrol"
4. View generated names and console output

## Integration Points

To integrate with the main game:

1. Import the spawner module in your map bootstrap
2. Call `spawnAllGroups(spawnService, areaId)` when loading an area
3. Add spawned fighters to the game's fighter list
4. Position fighters at spawner coordinates

Example:
```javascript
import { spawnAllGroups } from './js/npc-group-spawner.js';

// On area load
const fighters = spawnAllGroups(window.GAME.spawnService, areaId);
fighters.forEach(fighter => {
  // Position at spawner location
  const spawner = window.GAME.spawnService.getSpawner(areaId, fighter.spawnerId);
  fighter.pos = { x: spawner.x, y: spawner.y };

  // Add to game
  addNpcFighter(fighter);
});
```

## Future Enhancements

- [ ] Additional cultures (planned cultures from worldbuilding)
- [ ] Relationship tracking (family trees, marriages)
- [ ] Name uniqueness within groups
- [ ] Nickname/title generation
- [ ] Gender-neutral name support
- [ ] Load cultures from JSON config
- [ ] Save/load generated names for persistence
