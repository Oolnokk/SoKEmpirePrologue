# SpriteHolster System Design

## Overview

SpriteHolsters are a new map object type that bridges 3D visual representation with 2D gameplay mechanics. They allow props and NPCs to be visually embedded in 3D space while maintaining interaction through the 2D gameplay system.

## Architecture

### Core Components

1. **SpriteHolsterManager** (`docs/js/spriteholster-manager.js`)
   - Manages holster lifecycle (create, update, remove)
   - Renders 3D visualizations (billboards or debug symbols)
   - Handles coordinate transformation (2D gameplay ↔ 3D world)
   - Tracks proximity for player interaction

2. **ItemInteractionManager** (`docs/js/item-interaction.js`)
   - Detects player proximity to holsters (2D space)
   - Displays interaction prompts
   - Handles pickup/activation events
   - Bridges holster removal with 2D entity activation

3. **Integration Points**
   - `visualsmapLoader.js`: Loads holster entities from gameplaymaps
   - Game loop: Updates interaction manager each frame
   - Player state: Provides position for proximity checks

## Use Cases

### Case A: Billboard NPCs (Skeletal Rendering)

**Purpose:** Embed NPCs into 3D space as billboarded sprite planes showing posed skeletons.

**Visual Representation:**
- 3D billboard plane (always faces camera)
- Renders 2D sprite of NPC skeleton in specific pose
- Shows clothing/cosmetic layers over skeleton
- Positioned in 3D world space (e.g., guards flanking a door, shopkeeper behind counter)

**Body Part Sprites:**
Each fighter skeleton is composed of separate sprite layers:
- **Base body parts**: Head, torso, upper arm (L/R), forearm (L/R), thigh (L/R), shin (L/R)
- **Clothing layers**: Each body part can have corresponding clothing sprites
  - Example: torso → shirt, jacket, armor
  - Example: head → hat, helmet, mask
  - Example: legs → pants, skirt, greaves

**Rendering Pipeline:**
1. Determine NPC pose (idle_guard, bartender_lean, etc.)
2. Calculate bone positions for pose
3. For each body part:
   - Render base body part sprite
   - Render clothing/cosmetic layers on top
4. Composite all layers into single texture
5. Apply texture to billboard plane in 3D space
6. Billboard plane rotates to always face camera

**Interaction Flow:**
1. Player approaches guard holster in 2D gameplay space
2. Proximity detected → "Talk to Guard" prompt appears
3. Player presses E:
   - If crime detected: Remove 3D billboard, activate 2D fighter (opacity=1, AI enabled)
   - If shopkeeper: Open shop UI while keeping NPC in place

**Technical Considerations:**
- Billboard shader: Always face camera but maintain upright orientation
- Sprite atlas: Pre-render common poses or generate dynamically
- LOD: Simple silhouette at distance, full detail when near
- Lighting: Apply 3D lighting to billboard (normal maps optional)

**Pose Library:**
Predefined poses for common NPC states:
- `idle_guard`: Standing at attention
- `idle_casual`: Relaxed standing
- `bartender_lean`: Leaning on bar
- `shopkeeper_counter`: Behind shop counter
- `sitting_chair`: Seated position
- `patrol_walk`: Mid-walk pose

### Case B: Debug Symbol Props (Currently Implemented)

**Purpose:** Visualize prop spawn locations with simple 3D geometry patterns.

**Visual Representation:**
- Geometric primitives (spheres, boxes, cones)
- Arranged in patterns (piles, neat rows)
- Semi-transparent with wireframe outlines
- Color-coded by prop type

**Example Configurations:**
```javascript
// Bottle pile on table
{
  "type": "spriteholster",
  "holsterType": "prop",
  "linkedEntityId": "propspawn_bottle_1",
  "renderMode": "debug",
  "debugSymbols": [
    { "type": "sphere", "offset": [0, 10, 0], "color": "#ff6600", "size": 8 },
    { "type": "sphere", "offset": [5, 8, -3], "color": "#ff6600", "size": 8 },
    { "type": "sphere", "offset": [-4, 8, 2], "color": "#ff6600", "size": 8 }
  ],
  "interactionRadius": 80,
  "interactionPrompt": "Pick up bottle"
}

// Weapon rack (neat lineup)
{
  "type": "spriteholster",
  "holsterType": "prop",
  "linkedEntityId": "propspawn_sword_1",
  "renderMode": "debug",
  "debugSymbols": [
    { "type": "box", "offset": [0, 15, 0], "color": "#4488ff", "size": 6 },
    { "type": "box", "offset": [0, 15, 10], "color": "#4488ff", "size": 6 },
    { "type": "box", "offset": [0, 15, 20], "color": "#4488ff", "size": 6 }
  ],
  "interactionRadius": 80,
  "interactionPrompt": "Take weapon"
}
```

**Interaction Flow:**
1. Player approaches prop holster in 2D gameplay space
2. Proximity detected → "Pick up bottle" prompt appears
3. Player presses E:
   - Remove 3D debug symbols
   - Spawn prop in player's hand (2D sprite)
   - Update held item state

## Data Structure

### Gameplaymap Entity Format

```javascript
{
  "id": "holster_guard_left",
  "type": "spriteholster",
  "x": 5400,  // 2D gameplay coordinates
  "y": 100,
  "meta": {
    // Core properties
    "holsterType": "npc" | "prop",
    "linkedEntityId": "guard_npc_1",  // ID of 2D entity
    "renderMode": "billboard" | "debug",

    // Case A: Billboard NPC data
    "spriteData": {
      "skeletonPose": "idle_guard",  // Pose preset name
      "scale": 1.0,
      "yOffset": 0,  // Vertical offset in 3D units
      "facing": "left" | "right",

      // Body part sprite configuration
      "bodyParts": {
        "head": { "sprite": "head_human_male_1" },
        "torso": { "sprite": "torso_muscular_1" },
        "upperArmL": { "sprite": "arm_muscular_1" },
        "upperArmR": { "sprite": "arm_muscular_1" },
        "forearmL": { "sprite": "forearm_muscular_1" },
        "forearmR": { "sprite": "forearm_muscular_1" },
        "thighL": { "sprite": "leg_muscular_1" },
        "thighR": { "sprite": "leg_muscular_1" },
        "shinL": { "sprite": "shin_muscular_1" },
        "shinR": { "sprite": "shin_muscular_1" }
      },

      // Clothing/cosmetic layers
      "clothing": {
        "torso": [
          { "sprite": "shirt_guard_blue", "layer": 1 },
          { "sprite": "armor_chest_plate", "layer": 2 }
        ],
        "head": [
          { "sprite": "helmet_guard", "layer": 1 }
        ],
        "thighL": [{ "sprite": "pants_guard_blue", "layer": 1 }],
        "thighR": [{ "sprite": "pants_guard_blue", "layer": 1 }],
        "shinL": [{ "sprite": "boots_leather", "layer": 1 }],
        "shinR": [{ "sprite": "boots_leather", "layer": 1 }]
      }
    },

    // Case B: Debug symbol data
    "debugSymbols": [
      { "type": "sphere", "offset": [0, 10, 0], "color": "#ff0000", "size": 8 }
    ],

    // Interaction settings
    "interactionRadius": 80,
    "interactionPrompt": "Talk to Guard" | "Pick up bottle"
  }
}
```

### Runtime Holster Object

```javascript
{
  id: "holster_guard_left",
  type: "npc" | "prop",
  linkedEntityId: "guard_npc_1",
  object3d: THREE.Group,  // 3D scene object
  position2d: { x: 5400, y: 100 },  // For interaction checks
  position3d: THREE.Vector3,  // 3D world position
  interactionRadius: 80,
  interactionPrompt: "Talk to Guard",
  entity: { /* original entity data */ }
}
```

## Body Part Sprite System

### Sprite Organization

```
assets/sprites/
  body_parts/
    heads/
      head_human_male_1.png
      head_human_female_1.png
      head_elf_male_1.png
    torsos/
      torso_muscular_1.png
      torso_lean_1.png
      torso_athletic_1.png
    arms/
      upper_arm_muscular_1.png
      forearm_muscular_1.png
    legs/
      thigh_muscular_1.png
      shin_muscular_1.png

  clothing/
    torso/
      shirt_guard_blue.png
      shirt_peasant_brown.png
      armor_chest_plate.png
      jacket_leather.png
    head/
      helmet_guard.png
      hat_merchant.png
      mask_thief.png
    legs/
      pants_guard_blue.png
      pants_peasant_brown.png
      skirt_tavern_wench.png
    feet/
      boots_leather.png
      shoes_cloth.png
      greaves_metal.png
```

### Sprite Rendering Order

For each body part position:
1. Render base body part sprite
2. Render clothing layer 1 (if exists)
3. Render clothing layer 2 (if exists)
4. Continue for additional layers

Depth sorting by Z-order:
- Back shin → Back thigh → Back forearm → Back upper arm
- Torso → Head
- Front upper arm → Front forearm → Front thigh → Front shin

### Pose Definition Format

```javascript
const POSES = {
  idle_guard: {
    torso: 0,
    head: 5,
    lShoulder: -20,
    lElbow: 30,
    rShoulder: 20,
    rElbow: -30,
    lHip: 0,
    lKnee: 5,
    rHip: 0,
    rKnee: 5
  },
  bartender_lean: {
    torso: -15,
    head: 10,
    lShoulder: -45,
    lElbow: 90,  // Elbow on bar
    rShoulder: -30,
    rElbow: 60,
    lHip: 10,
    lKnee: 15,
    rHip: 5,
    rKnee: 10
  }
  // ... more poses
};
```

## Implementation Phases

### Phase 1: Case B - Debug Symbols (Current)
- ✅ SpriteHolsterManager with debug symbol rendering
- ✅ ItemInteractionManager with proximity detection
- ✅ Integration with visualsmapLoader
- ⏳ Add holster entities to gameplaymap
- ⏳ Connect to held item system
- ⏳ Test prop pickup flow

### Phase 2: Held Item System
- Extend animator.js with `F.anim.heldItem` state
- Add held item rendering to sprites.js
- Bone attachment for held items (similar to weapons)
- Item positioning and rotation
- Hand grip animation adjustments

### Phase 3: Case A - Billboard NPCs
- Billboard shader implementation
- Sprite compositing system (body parts + clothing)
- Pose library and bone calculation
- Texture generation and caching
- NPC activation/deactivation flow
- Integration with existing NPC AI

### Phase 4: Polish & Optimization
- LOD system for distant NPCs
- Sprite atlas optimization
- Lighting and shadow integration
- Animation blending (subtle idle movements)
- Performance profiling and optimization

## Technical Notes

### Coordinate Transformation

SpriteHolsters exist in both coordinate systems:
- **2D Gameplay**: `{ x, y }` in pixels, used for interaction detection
- **3D World**: `THREE.Vector3`, used for rendering

Transform function in visualsmapLoader.js:
```javascript
const coordinateTransform = {
  gameplayTo3D: (x, y) => {
    const transformConfig = resolveTransform();
    const pos3d = transform2dTo3d({ x, y }, transformConfig);
    const vec = new THREE.Vector3(pos3d.x, pos3d.y, pos3d.z);

    // Apply world rotation if path alignment is enabled
    if (alignWorldToPath && Number.isFinite(pathYawRad)) {
      vec.applyAxisAngle(new THREE.Vector3(0, 1, 0), -pathYawRad);
    }

    return vec;
  }
};
```

### Billboard Rendering Strategy

For Case A NPCs, billboards must:
1. Always face camera (rotate on Y axis only)
2. Maintain upright orientation (no pitch/roll)
3. Preserve sprite scale regardless of camera distance
4. Update rotation each frame efficiently

Shader approach (recommended):
```glsl
// Vertex shader - billboard transformation
vec3 cameraRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[0][2]));
vec3 cameraUp = vec3(0.0, 1.0, 0.0);
vec3 worldPos = center + cameraRight * position.x * scale + cameraUp * position.y * scale;
```

### Memory Optimization

For many NPC billboards:
- Share geometry between instances (single plane mesh)
- Use texture atlases to reduce draw calls
- Instance rendering for identical NPCs
- Frustum culling to skip off-screen NPCs
- Compress sprite data (texture compression)

### Lighting Integration

Billboard NPCs should respond to 3D lighting:
- Sample ambient light at NPC position
- Apply directional light based on normal (facing camera)
- Optional: Normal map for depth illusion
- Match lighting with surrounding 3D environment

## Future Enhancements

1. **Animated Billboards**: Cycle through sprite frames for idle animations
2. **Dynamic Poses**: NPCs react to nearby events (point, look, gesture)
3. **Dialogue Integration**: Speech bubbles positioned above billboard NPCs
4. **Shadow Casting**: Billboard NPCs cast shadows on ground
5. **Sprite Customization**: Procedural variation (tints, accessories)
6. **Seasonal Clothing**: Swap clothing sprites based on time/weather

## Related Systems

- **NPC System** (`docs/js/npc.js`): 2D NPC AI and behavior
- **Fighter System** (`docs/js/fighter.js`): Combat and animation
- **Sprite System** (`docs/js/sprites.js`): 2D sprite rendering
- **Animator** (`docs/js/animator.js`): Pose and animation state
- **Cosmetics** (`docs/js/cosmetics.js`): Equipment and layering

## Testing Strategy

### Unit Tests
- Coordinate transformation accuracy
- Proximity detection edge cases
- Holster lifecycle (add/remove/cleanup)

### Integration Tests
- Gameplaymap loading with holster entities
- Interaction flow (proximity → prompt → pickup)
- 3D/2D synchronization

### Visual Tests
- Debug symbols render correctly
- Billboard NPCs face camera
- Clothing layers composite properly
- Lighting matches environment

### Performance Tests
- 50+ holsters in scene
- Rapid pickup/spawn cycles
- Memory leak detection (dispose cleanup)
