# SUBWAY SPIDER — Character Sprite Sheet Specification

This document specifies the exact asset requirements, frame slots, dimensions, anchor origins, and hand attachment coordinates for the player character sprite sheet in **SUBWAY SPIDER**.

Any external PNG sprite sheet created by an artist, animator, or 3D renderer can be dropped directly into:
`public/assets/player_spritesheet.png`
and will immediately be loaded and animated by the game without code changes!

---

## 📐 1. File & Atlas Dimensions

| Parameter | Specification |
|---|---|
| **File Location** | `public/assets/player_spritesheet.png` |
| **File Format** | 32-bit RGBA PNG with transparent background |
| **Atlas Width** | `640` pixels (4 columns × 160 px) |
| **Atlas Height** | `800` pixels (4 rows × 200 px) |
| **Frame Width** | `160` pixels |
| **Frame Height** | `200` pixels |
| **Total Frames** | 16 frames (indices 0 to 15) |
| **Ground Anchor Origin** | `(80, 188)` in each 160×200 cell (`originX = 0.50`, `originY = 0.94`) |

---

## 🎞️ 2. Frame Slot Layout (4x4 Grid)

```
+----------------+----------------+----------------+----------------+
|    FRAME 0     |    FRAME 1     |    FRAME 2     |    FRAME 3     |
|     RUN_0      |     RUN_1      |     RUN_2      |     RUN_3      |
| Right foot plant| Right support | Right push-off | Air flight 1   |
+----------------+----------------+----------------+----------------+
|    FRAME 4     |    FRAME 5     |    FRAME 6     |    FRAME 7     |
|     RUN_4      |     RUN_5      |     RUN_6      |     RUN_7      |
| Left foot plant | Left support  | Left push-off  | Air flight 2   |
+----------------+----------------+----------------+----------------+
|    FRAME 8     |    FRAME 9     |    FRAME 10    |    FRAME 11    |
|      JUMP      |      FALL      |      LAND      |   WEB_SHOOT    |
|  Takeoff leap  |  Glide descent | Impact squash  | Arm outstretched|
+----------------+----------------+----------------+----------------+
|    FRAME 12    |    FRAME 13    |    FRAME 14    |    FRAME 15    |
|  WEB_ATTACHED  |     SWING      |   TRAIN_RUN    |  LEAVE_TRAIN   |
| Holding line   | Pendulum hold  | Rooftop sprint | Step off edge  |
+----------------+----------------+----------------+----------------+
```

---

## 🏃 3. Detailed Frame Descriptions

### Running Cycle (Frames 0 to 7)
The running animation is an 8-frame seamless loop.
- **Frame 0 (`RUN_0`)**: Right foot makes ground contact. Left leg kicked back high at ~90° knee angle with heel lifted. Left arm forward, right arm back.
- **Frame 1 (`RUN_1`)**: Right leg bearing body weight directly under hip. Left knee driving forward. Torso at lowest stride bounce.
- **Frame 2 (`RUN_2`)**: Right foot pushes off on toes. Left knee driving high in front. Torso ascending.
- **Frame 3 (`RUN_3`)**: Airborne flight phase. Both feet off the ground. Torso at peak vertical bounce.
- **Frame 4 (`RUN_4`)**: Left foot makes ground contact. Right leg kicked back high at ~90° knee angle with heel lifted. Right arm forward, left arm back.
- **Frame 5 (`RUN_5`)**: Left leg bearing body weight under hip. Right knee driving forward. Torso at lowest stride bounce.
- **Frame 6 (`RUN_6`)**: Left foot pushes off on toes. Right knee driving high in front. Torso ascending.
- **Frame 7 (`RUN_7`)**: Airborne flight phase. Both feet off the ground. Torso at peak vertical bounce.

### Jump & Grounding (Frames 8 to 10)
- **Frame 8 (`JUMP`)**: Rising leap pose ($v_y > 0$). Leading knee tucked high to chest, trailing leg bent under hip, arms driving upward.
- **Frame 9 (`FALL`)**: Descent glide pose ($v_y \le 0$). Legs extending downward to prepare for surface contact, arms spread for aerodynamic balance.
- **Frame 10 (`LAND`)**: Landing impact compression ($0.14$s). Pelvis squashed low, knees flared outward in an athletic deep crouch, sneakers planted flat on the running surface.

### Spider Web & Swing (Frames 11 to 13)
- **Frame 11 (`WEB_SHOOT`)**: Right arm outstretched forward-upward at ~55° toward overhead steel pipe anchor. Right hand in web-shooting gesture.
  - **Hand Offset**: `(X: +38, Y: -152)` relative to cell origin `(80, 188)`.
- **Frame 12 (`WEB_ATTACHED`)**: Right hand gripping the taut web line firmly overhead. Body braced for swing.
- **Frame 13 (`SWING`)**: Pendulum swing arc. Right hand holding web line overhead, torso tilted forward along trajectory, muscular legs swept backward trailing in the headwind.
  - **Hand Offset**: `(X: +18, Y: -168)` relative to cell origin `(80, 188)`.

### Train Roof (Frames 14 to 15)
- **Frame 14 (`TRAIN_RUN`)**: High-velocity rooftop sprint pose with wind-flattened jacket and lower athletic stance.
- **Frame 15 (`LEAVE_TRAIN`)**: Running off the rear of the train roof into open air. Stepping forward into flight, smoothly transitioning to `FALL`.

---

## 🎨 4. Character Design Identity

- **Head**: Masked crimson red superhero cowl (`#e11d48`) with iconic angular white reflective spider eye lenses and dark webbing lines.
- **Jacket**: Subway-runner streetwear jacket:
  - Cream / off-white main fabric (`#f8fafc` / `#f1f5f9`).
  - Light-blue denim shoulder yoke (`#38bdf8` / `#0284c7`) across the upper back and shoulder blades.
  - Fabric hood resting behind the neck with light-blue inner lining.
  - Outer arm racing stripes and dark ribbed wrist cuffs (`#1e293b`).
  - Center zipper with silver pull tab revealing red chest suit and spider emblem.
- **Legs & Footwear**:
  - Deep midnight navy athletic pants (`#1e3a8a`).
  - Far leg shaded with darker ambient shadow (`#0a0f1d`) for distinct depth separation.
  - Red high-top sneakers (`#e11d48`) with crisp white vulcanized rubber midsoles ($4$ px thick) and black rubber tread outsoles.

---

## 🛠️ 5. Replacing the Sprite Sheet

To update or replace the character with your own custom artwork:
1. Export your 16 frames arranged in the 4×4 grid ($640 \times 800$ PNG).
2. Save or overwrite `public/assets/player_spritesheet.png`.
3. Reload the browser at `http://localhost:5173/`—the game will immediately animate your custom frames!
