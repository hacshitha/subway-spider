import Phaser from 'phaser';
import { Perspective3D } from '../rendering/Perspective3D';

export type TrainLengthType = 'SHORT' | 'MEDIUM' | 'LONG';

export interface SubwayTrain {
  id: number;
  lane: -1 | 0 | 1;
  frontZ: number;      // Z position of the front of the train
  length: number;      // Length of train along Z axis
  height: number;      // Height above rails (roof elevation = 85)
  width: number;       // Width of train (approx 72)
  accentColor: number; // Blue (0x0284c7) or Red (0xe63946)
  type: TrainLengthType;
}

export class TrainSystem {
  private scene: Phaser.Scene;
  private trains: SubwayTrain[] = [];
  private nextTrainId: number = 1;
  private spawnTimer: number = 0;
  private minSpawnInterval: number = 2.4; // seconds between train spawns
  private graphics: Phaser.GameObjects.Graphics;

  public static readonly TRAIN_HEIGHT = 85;
  public static readonly TRAIN_WIDTH = 74;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = this.scene.add.graphics();
    this.graphics.setDepth(10);
  }

  public reset(): void {
    this.trains = [];
    this.spawnTimer = 1.0;
    this.graphics.clear();
  }

  public update(speed: number, deltaSec: number): void {
    // Relative approach speed: Trains rush forward toward oncoming player
    const moveDist = (speed * 1.15) * deltaSec;

    // Move trains forward
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const train = this.trains[i];
      train.frontZ -= moveDist;

      // Remove trains that have completely passed behind camera
      if (train.frontZ + train.length < 0) {
        this.trains.splice(i, 1);
      }
    }

    // Spawn new trains with progressive difficulty curve
    this.spawnTimer -= deltaSec;
    if (this.spawnTimer <= 0) {
      this.spawnTrain();
      // Early game: ~2.8s spacing. Mid/late game: smoothly scales to ~1.4s
      this.spawnTimer = Math.max(1.35, this.minSpawnInterval - (speed - 540) * 0.0016);
    }

    this.render();
  }

  private spawnTrain(): void {
    // Pick lane (-1, 0, 1)
    const availableLanes: (-1 | 0 | 1)[] = [-1, 0, 1];

    // Filter out lanes that already have a train near the horizon (Z > 1050)
    const occupiedLanes = new Set(
      this.trains.filter(t => t.frontZ > 1050).map(t => t.lane)
    );
    const validLanes = availableLanes.filter(l => !occupiedLanes.has(l));
    if (validLanes.length === 0) return;

    const chosenLane = validLanes[Math.floor(Math.random() * validLanes.length)];

    // Dynamic Train Lengths (SHORT: 260, MEDIUM: 440, LONG: 680)
    const trainTypes: { type: TrainLengthType; length: number }[] = [
      { type: 'SHORT', length: 260 },
      { type: 'MEDIUM', length: 440 },
      { type: 'LONG', length: 680 }
    ];
    const picked = trainTypes[Math.floor(Math.random() * trainTypes.length)];

    const accentColors = [0x0284c7, 0xe63946, 0x0284c7];
    const accentColor = accentColors[Math.floor(Math.random() * accentColors.length)];

    // Spawn far at horizon (1600 units) so player has ample visual recognition time
    this.trains.push({
      id: this.nextTrainId++,
      lane: chosenLane,
      frontZ: Perspective3D.MAX_Z + 500,
      length: picked.length,
      height: TrainSystem.TRAIN_HEIGHT,
      width: TrainSystem.TRAIN_WIDTH,
      accentColor: accentColor,
      type: picked.type
    });
  }

  /**
   * Finds if an oncoming train will intercept the player's landing area
   * during a web swing.
   * Calculates where the train will be at landing time (after swingDurationSec).
   */
  public getTrainInterceptingLanding(
    lane: number,
    swingDurationSec: number,
    currentSpeed: number,
    playerZ: number = Perspective3D.PLAYER_Z
  ): SubwayTrain | null {
    const trainTravel = (currentSpeed * 1.15) * swingDurationSec;

    for (const train of this.trains) {
      if (train.lane === lane) {
        // Projected position of train when the player lands
        const projectedFront = train.frontZ - trainTravel;
        const projectedBack = projectedFront + train.length;

        // Will the player land safely on this train's roof?
        // Generous landing window: anywhere along the train roof platform
        if (projectedFront <= playerZ + 55 && projectedBack >= playerZ - 25) {
          return train;
        }
      }
    }
    return null;
  }

  /**
   * Finds if a train is positioned in the given lane under or near playerZ
   */
  public getTrainUnderPosition(lane: number, playerZ: number = Perspective3D.PLAYER_Z): SubwayTrain | null {
    for (const train of this.trains) {
      if (train.lane === lane) {
        const trainFront = train.frontZ;
        const trainBack = train.frontZ + train.length;
        // Check if player Z is within or very close to train roof bounds
        if (playerZ >= trainFront - 30 && playerZ <= trainBack + 20) {
          return train;
        }
      }
    }
    return null;
  }

  /**
   * Checks if a train roof is still beneath the player.
   * If (train.frontZ + train.length) < playerZ, player has reached the end of the train!
   */
  public isPlayerStillOnTrainRoof(trainId: number, playerZ: number = Perspective3D.PLAYER_Z): boolean {
    const train = this.trains.find(t => t.id === trainId);
    if (!train) return false;
    // Must be before the back edge of the train roof
    return (train.frontZ + train.length) >= playerZ - 15;
  }

  public getTrainById(id: number): SubwayTrain | undefined {
    return this.trains.find(t => t.id === id);
  }

  /**
   * Checks collision or roof landing with player.
   * Returns:
   *  'CRASH' -> hit front/side while below roof height
   *  'ROOF'  -> safely landed or running on top of train roof
   *  'NONE'  -> no collision
   */
  public checkPlayerInteraction(
    playerWorldX: number,
    playerElevation: number,
    playerZ: number = Perspective3D.PLAYER_Z
  ): { status: 'NONE' | 'ROOF' | 'CRASH'; train?: SubwayTrain } {
    for (const train of this.trains) {
      const trainCenterX = Perspective3D.getLaneWorldX(train.lane);
      // Fair horizontal hitbox: 74 * 0.38 = 28.1 units (was 0.52 = 38.5)
      // Allows clean near-miss dodges into adjacent lanes without clipping
      const halfW = train.width * 0.38;

      // Check horizontal overlap
      if (Math.abs(playerWorldX - trainCenterX) < halfW) {
        const trainFront = train.frontZ;
        const trainBack = train.frontZ + train.length;

        // Visual contact occurs only when the front bumper reaches the player plane (playerZ = 130)
        // Eliminates the unfair 20-35 unit premature invisible collision
        const isInTrainRange = trainFront <= playerZ + 8 && trainBack >= playerZ - 12;

        if (isInTrainRange) {
          // Generous roof landing margin: elevation >= 62 (roof is 85) lands safely on roof
          if (playerElevation >= train.height - 23) {
            return { status: 'ROOF', train };
          }

          // Player is at track level when train front/side reaches them: crash
          return { status: 'CRASH', train };
        }
      }
    }

    return { status: 'NONE' };
  }

  private render(): void {
    this.graphics.clear();

    // Sort trains back-to-front so closer trains render on top
    const sortedTrains = [...this.trains].sort((a, b) => b.frontZ - a.frontZ);

    for (const train of sortedTrains) {
      this.drawTrain(train);
    }
  }

  private drawTrain(train: SubwayTrain): void {
    const laneX = Perspective3D.getLaneWorldX(train.lane);
    const halfW = train.width / 2;
    const h = train.height;

    const frontZ = Math.max(15, train.frontZ);
    const backZ = Math.max(25, train.frontZ + train.length);

    // Front face coordinates
    const pFrontBL = Perspective3D.project(laneX - halfW, 0, frontZ);
    const pFrontBR = Perspective3D.project(laneX + halfW, 0, frontZ);
    const pFrontTL = Perspective3D.project(laneX - halfW, h, frontZ);
    const pFrontTR = Perspective3D.project(laneX + halfW, h, frontZ);

    // Back face coordinates (for roof and sides)
    const pBackTL = Perspective3D.project(laneX - halfW, h, backZ);
    const pBackTR = Perspective3D.project(laneX + halfW, h, backZ);
    const pBackBL = Perspective3D.project(laneX - halfW, 0, backZ);
    const pBackBR = Perspective3D.project(laneX + halfW, 0, backZ);

    // 1. Draw ROOF top surface (playable platform)
    this.graphics.fillStyle(0x334155, 1); // Dark metallic roof
    this.graphics.beginPath();
    this.graphics.moveTo(pFrontTL.x, pFrontTL.y);
    this.graphics.lineTo(pFrontTR.x, pFrontTR.y);
    this.graphics.lineTo(pBackTR.x, pBackTR.y);
    this.graphics.lineTo(pBackTL.x, pBackTL.y);
    this.graphics.closePath();
    this.graphics.fill();

    // Metallic roof walkway / anti-slip running tread
    const pWalkwayLFront = Perspective3D.project(laneX - halfW * 0.45, h, frontZ);
    const pWalkwayRFront = Perspective3D.project(laneX + halfW * 0.45, h, frontZ);
    const pWalkwayRBack = Perspective3D.project(laneX + halfW * 0.45, h, backZ);
    const pWalkwayLBack = Perspective3D.project(laneX - halfW * 0.45, h, backZ);
    this.graphics.fillStyle(0x475569, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(pWalkwayLFront.x, pWalkwayLFront.y);
    this.graphics.lineTo(pWalkwayRFront.x, pWalkwayRFront.y);
    this.graphics.lineTo(pWalkwayRBack.x, pWalkwayRBack.y);
    this.graphics.lineTo(pWalkwayLBack.x, pWalkwayLBack.y);
    this.graphics.closePath();
    this.graphics.fill();

    // Yellow roof center warning strip
    const pRoofStripFront = Perspective3D.project(laneX, h, frontZ);
    const pRoofStripBack = Perspective3D.project(laneX, h, backZ);
    this.graphics.lineStyle(Math.max(2, 5 * pFrontTL.scale), 0xffb703, 0.95);
    this.graphics.lineBetween(pRoofStripFront.x, pRoofStripFront.y, pRoofStripBack.x, pRoofStripBack.y);

    // Roof AC units / ventilation housings along the top
    for (let vz = frontZ + 70; vz < backZ - 40; vz += 95) {
      const pVent = Perspective3D.project(laneX, h + 6, vz);
      const ventW = 26 * pVent.scale;
      const ventH = 8 * pVent.scale;
      this.graphics.fillStyle(0x1e293b, 0.95);
      this.graphics.fillRect(pVent.x - ventW / 2, pVent.y - ventH / 2, ventW, ventH);
      this.graphics.fillStyle(0x94a3b8, 0.8);
      this.graphics.fillRect(pVent.x - ventW / 2 + 2, pVent.y - ventH / 2 + 2, ventW - 4, 2);
    }

    // 2. Draw Side Walls (if visible depending on lane)
    // Left side visible if lane is 0 or 1
    if (train.lane >= 0) {
      this.graphics.fillStyle(0xe2e8f0, 0.98); // Clean metallic silver-white siding
      this.graphics.beginPath();
      this.graphics.moveTo(pFrontTL.x, pFrontTL.y);
      this.graphics.lineTo(pBackTL.x, pBackTL.y);
      this.graphics.lineTo(pBackBL.x, pBackBL.y);
      this.graphics.lineTo(pFrontBL.x, pFrontBL.y);
      this.graphics.closePath();
      this.graphics.fill();

      // Colored racing accent stripe along side
      const pSideStripeFront = Perspective3D.project(laneX - halfW, h * 0.45, frontZ);
      const pSideStripeBack = Perspective3D.project(laneX - halfW, h * 0.45, backZ);
      this.graphics.lineStyle(Math.max(2, 9 * pSideStripeFront.scale), train.accentColor, 1);
      this.graphics.lineBetween(pSideStripeFront.x, pSideStripeFront.y, pSideStripeBack.x, pSideStripeBack.y);

      // Warm lit passenger windows along the left side
      for (let wz = frontZ + 45; wz < backZ - 30; wz += 55) {
        const pWinTL = Perspective3D.project(laneX - halfW, h * 0.82, wz);
        const pWinBR = Perspective3D.project(laneX - halfW, h * 0.55, wz + 32);
        this.graphics.fillStyle(0x0f172a, 0.9);
        this.graphics.fillRect(pWinTL.x, pWinTL.y, pWinBR.x - pWinTL.x, pWinBR.y - pWinTL.y);
        this.graphics.fillStyle(0xfef08a, 0.5); // Soft warm interior glow
        this.graphics.fillRect(pWinTL.x + 1, pWinTL.y + 1, pWinBR.x - pWinTL.x - 2, pWinBR.y - pWinTL.y - 2);
      }
    }

    // Right side visible if lane is 0 or -1
    if (train.lane <= 0) {
      this.graphics.fillStyle(0xcbd5e1, 0.98);
      this.graphics.beginPath();
      this.graphics.moveTo(pFrontTR.x, pFrontTR.y);
      this.graphics.lineTo(pBackTR.x, pBackTR.y);
      this.graphics.lineTo(pBackBR.x, pBackBR.y);
      this.graphics.lineTo(pFrontBR.x, pFrontBR.y);
      this.graphics.closePath();
      this.graphics.fill();

      // Accent stripe right side
      const pSideStripeFrontR = Perspective3D.project(laneX + halfW, h * 0.45, frontZ);
      const pSideStripeBackR = Perspective3D.project(laneX + halfW, h * 0.45, backZ);
      this.graphics.lineStyle(Math.max(2, 9 * pSideStripeFrontR.scale), train.accentColor, 1);
      this.graphics.lineBetween(pSideStripeFrontR.x, pSideStripeFrontR.y, pSideStripeBackR.x, pSideStripeBackR.y);

      // Warm lit passenger windows along the right side
      for (let wz = frontZ + 45; wz < backZ - 30; wz += 55) {
        const pWinTL = Perspective3D.project(laneX + halfW, h * 0.82, wz);
        const pWinBR = Perspective3D.project(laneX + halfW, h * 0.55, wz + 32);
        this.graphics.fillStyle(0x0f172a, 0.9);
        this.graphics.fillRect(pWinTL.x, pWinTL.y, pWinBR.x - pWinTL.x, pWinBR.y - pWinTL.y);
        this.graphics.fillStyle(0xfef08a, 0.5);
        this.graphics.fillRect(pWinTL.x + 1, pWinTL.y + 1, pWinBR.x - pWinTL.x - 2, pWinBR.y - pWinTL.y - 2);
      }
    }

    // 3. Draw FRONT FACE (Facing oncoming player)
    this.graphics.fillStyle(0xf8fafc, 1); // Clean bright metallic front
    this.graphics.beginPath();
    this.graphics.moveTo(pFrontTL.x, pFrontTL.y);
    this.graphics.lineTo(pFrontTR.x, pFrontTR.y);
    this.graphics.lineTo(pFrontBR.x, pFrontBR.y);
    this.graphics.lineTo(pFrontBL.x, pFrontBL.y);
    this.graphics.closePath();
    this.graphics.fill();
    this.graphics.lineStyle(Math.max(1, 2.5 * pFrontTL.scale), 0x94a3b8, 1);
    this.graphics.strokePath();

    // Front Windshield (tinted glass with curved rim & reflection)
    const pGlassTL = Perspective3D.project(laneX - halfW * 0.82, h * 0.88, frontZ);
    const pGlassBR = Perspective3D.project(laneX + halfW * 0.82, h * 0.52, frontZ);
    const gw = pGlassBR.x - pGlassTL.x;
    const gh = pGlassBR.y - pGlassTL.y;
    this.graphics.fillStyle(0x0f172a, 0.95);
    this.graphics.fillRect(pGlassTL.x, pGlassTL.y, gw, gh);

    // Windshield diagonal specular reflection line
    this.graphics.lineStyle(1.5, 0x38bdf8, 0.6);
    this.graphics.lineBetween(pGlassTL.x + 4, pGlassTL.y + 4, pGlassTL.x + gw * 0.45, pGlassTL.y + gh - 4);

    // Front superhero accent stripe (Red or Blue)
    const pStripeTL = Perspective3D.project(laneX - halfW, h * 0.48, frontZ);
    const pStripeBR = Perspective3D.project(laneX + halfW, h * 0.36, frontZ);
    this.graphics.fillStyle(train.accentColor, 1);
    this.graphics.fillRect(pStripeTL.x, pStripeTL.y, pStripeBR.x - pStripeTL.x, pStripeBR.y - pStripeTL.y);

    // Dual Glowing Headlights with warm halos
    const lightRadius = Math.max(2.5, 7 * pFrontTL.scale);
    const pLightLeft = Perspective3D.project(laneX - halfW * 0.64, h * 0.22, frontZ);
    const pLightRight = Perspective3D.project(laneX + halfW * 0.64, h * 0.22, frontZ);

    // Warm radial bloom halos
    this.graphics.fillStyle(0xfff08a, 0.35);
    this.graphics.fillCircle(pLightLeft.x, pLightLeft.y, lightRadius * 2.2);
    this.graphics.fillCircle(pLightRight.x, pLightRight.y, lightRadius * 2.2);

    // Concentrated golden halo
    this.graphics.fillStyle(0xffe066, 0.7);
    this.graphics.fillCircle(pLightLeft.x, pLightLeft.y, lightRadius * 1.3);
    this.graphics.fillCircle(pLightRight.x, pLightRight.y, lightRadius * 1.3);

    // Bright white core
    this.graphics.fillStyle(0xffffff, 1);
    this.graphics.fillCircle(pLightLeft.x, pLightLeft.y, lightRadius * 0.7);
    this.graphics.fillCircle(pLightRight.x, pLightRight.y, lightRadius * 0.7);

    // Bottom Bumper with hazard diagonal stripes
    const pBumperTL = Perspective3D.project(laneX - halfW * 0.96, h * 0.12, frontZ);
    const pBumperBR = Perspective3D.project(laneX + halfW * 0.96, 0, frontZ);
    const bw = pBumperBR.x - pBumperTL.x;
    const bh = pBumperBR.y - pBumperTL.y;

    this.graphics.fillStyle(0xffb703, 1); // Yellow base
    this.graphics.fillRect(pBumperTL.x, pBumperTL.y, bw, bh);

    // Black chevron stripes
    this.graphics.fillStyle(0x0f172a, 1);
    const numStripes = 6;
    const stripeW = bw / (numStripes * 2);
    for (let s = 0; s < numStripes; s++) {
      this.graphics.fillRect(pBumperTL.x + s * stripeW * 2, pBumperTL.y, stripeW, bh);
    }
  }

  public getTrains(): SubwayTrain[] {
    return this.trains;
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
