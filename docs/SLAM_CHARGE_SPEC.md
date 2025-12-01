# SLAM Heavy Attack - Charge Phase Specification

## Overview
The SLAM heavy attack is a hold-release gap-closer attack designed to cover significant distance and provide clear visual telegraph before execution.

## Attack Sequence

The SLAM attack follows a 4-phase sequence:

### 1. Windup (400ms)
- Initial wind-up animation
- Arms pull back (-360° shoulders)
- Legs bend (90° knees)
- Vertical velocity applied: -680 (slight lift)
- Reduced gravity (0.35×) for extended air time

### 2. Charge (400ms) ⭐ NEW PHASE
- Deep charge pose with further arm pullback (-370° shoulders)
- Deeper leg bend (110° knees)
- **Lerped translation**: 75px forward movement over full duration
- Translation uses local space (respects facing direction)
- Provides clear visual telegraph that attack is about to launch

### 3. Slam/Strike (160ms)
- Strike pose with full extension
- **Velocity-based dash**: 400 velocity × 5 multiplier = 2000 velocity/s
- Dash duration: 1.2s
- Attack range: 75px
- Colliders: handL, handR
- Damage: 22 health
- Stamina cost: 28

### 4. Recoil (200ms)
- Recovery animation
- Return to neutral state

## Technical Implementation

### Lerped Translate System
**Purpose**: Smoothly move character position during animation phases

**Location**: `docs/js/animator.js` - `processAnimEventsForOverride()`

**Mechanism**:
```javascript
translate: { x: 75, y: 0, local: true }
```

- Tracks animation progress (k) from 0 to 1
- Calculates incremental position change: `deltaK = k - previousK`
- Applies translation: `pos.x += tx * deltaK * facingMult`
- Distributes 75px movement evenly across 400ms Charge phase
- `local: true` flag multiplies by `facingSign` for direction

### Velocity-Based Dash System
**Purpose**: Create explosive gap-closing movement during strike

**Location**: `docs/js/attack-dash.js`

**Mechanism**:
```javascript
dash: { velocity: 400, duration: 1.2 }
```

- Sets velocity directly every frame (not impulse-based)
- Total velocity = 400 × 5 (debug multiplier) × 2 (heavy attack bonus) = 4000
- Friction override set to 0 for maintained speed
- Brakes when target enters collider range or duration expires

## Movement Breakdown

**Total Distance Covered**:
- Charge phase: 75px (smooth slide)
- Strike phase: ~4800px at 4000 velocity over 1.2s (explosive dash)

**Visual Feel**:
1. Windup: Character pulls back and lifts slightly
2. Charge: Character slides forward 75px (range distance) while loading power
3. Strike: Character rockets forward at superhuman speed
4. Recoil: Character recovers from impact

## Configuration Files

### `docs/config/config.js`

**SLAM_MOVE_POSES** (lines 624-672):
- Defines all pose data including new Charge phase
- Charge phase includes `translate` parameter

**SLAM Preset** (lines 1184-1197):
- Defines attack properties and sequence
- `durations` object includes `toCharge: 400`
- Sequence array includes Charge between Windup and Slam

**Slam Ability** (lines 1913-1924):
- Player-facing attack configuration
- Sets damage, stamina cost, colliders, range
- Configures velocity-based dash

## Debug Visualization

**Velocity Arrow**:
- Green arrow showing velocity direction and magnitude
- Label displays arrow length in pixels
- Toggle: "Show Velocity Arrow" checkbox in debug panel

**Sliders**:
- Dash Impulse × (10.0 default)
- Dash Friction × (0.01 default)
- Dash Weight Drop (0.0 default)

## Design Intent

The Charge phase serves multiple purposes:

1. **Visual Telegraph**: Clear signal that powerful attack incoming
2. **Positioning**: Moves character exactly to attack range (75px)
3. **Gap Closer Setup**: Positions for explosive dash phase
4. **Player Feedback**: Distinct animation shows attack charging
5. **NPC Behavior**: Gives defenders time to react/counter

The two-stage movement (smooth slide + explosive dash) creates a more readable and impactful heavy attack compared to instant acceleration.
