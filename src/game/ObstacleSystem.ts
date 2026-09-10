import Phaser from 'phaser';
import { Perspective3D } from '../rendering/Perspective3D';

export interface Obstacle {
  id: number;
  lane: -1 | 0 | 1;
  z: number;
  height: number;
  width: number;
}

export class ObstacleSystem {
  private scene: Phaser.Scene;
  private obstacles: Obstacle[] = [];
  private nextId: number = 1;
  private spawnTimer: number = 1.8;
  private graphics: Phaser.GameObjects.Graphics;

  public static readonly BARRIER_HEIGHT = 42;
  public static readonly BARRIER_WIDTH = 70;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = this.scene.add.graphics();
    this.graphics.setDepth(12);
  }

  public reset(): void {
    this.obstacles = [];
    this.spawnTimer = 2.0;
    this.graphics.clear();
  }

  public update(speed: number, deltaSec: number, occupiedLanesAtHorizon: Set<-1 | 0 | 1>): void {
    const moveDist = speed * deltaSec;

    // Move obstacles forward
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z -= moveDist;

      if (obs.z < 0) {
        this.obstacles.splice(i, 1);
      }
    }

    // Spawn obstacles with progressive curve
    this.spawnTimer -= deltaSec;
    if (this.spawnTimer <= 0) {
      this.spawnObstacle(occupiedLanesAtHorizon);
      this.spawnTimer = Math.max(1.8, (3.0 - (speed - 540) * 0.0012) + Math.random() * 0.8);
    }

    this.render();
  }

  private spawnObstacle(occupiedLanes: Set<-1 | 0 | 1>): void {
    const candidateLanes: (-1 | 0 | 1)[] = [-1, 0, 1];
    const availableLanes = candidateLanes.filter(l => !occupiedLanes.has(l));
    if (availableLanes.length === 0) return;

    const chosenLane = availableLanes[Math.floor(Math.random() * availableLanes.length)];

    // Spawn far at horizon (1480 units) for clear visual anticipation
    this.obstacles.push({
      id: this.nextId++,
      lane: chosenLane,
      z: Perspective3D.MAX_Z + 380,
      height: ObstacleSystem.BARRIER_HEIGHT,
      width: ObstacleSystem.BARRIER_WIDTH
    });
  }

  /**
   * Checks if player collides with barrier.
   * Player must jump higher than obstacle height (42) to clear it.
   */
  public checkPlayerCollision(
    playerWorldX: number,
    playerElevation: number,
    playerZ: number = Perspective3D.PLAYER_Z
  ): boolean {
    for (const obs of this.obstacles) {
      const laneX = Perspective3D.getLaneWorldX(obs.lane);
      // Fair horizontal width: 70 * 0.38 = 26.6 units (was 0.48 = 33.6)
      // Allows smooth close-pass dodges into adjacent lanes without clipping
      const halfW = obs.width * 0.38;

      if (Math.abs(playerWorldX - laneX) < halfW) {
        // Barrier contact happens right as the player physically passes through the barrier plane (playerZ = 130)
        // Eliminates the 22-unit early invisible crash
        if (obs.z <= playerZ + 8 && obs.z >= playerZ - 12) {
          // If player elevation is lower than barrier (with fair clearance), crash!
          if (playerElevation < obs.height - 8) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private render(): void {
    this.graphics.clear();

    for (const obs of this.obstacles) {
      this.drawBarrier(obs);
    }
  }

  private drawBarrier(obs: Obstacle): void {
    const laneX = Perspective3D.getLaneWorldX(obs.lane);
    const halfW = obs.width / 2;
    const h = obs.height;
    const z = Math.max(10, obs.z);

    const pBL = Perspective3D.project(laneX - halfW, 0, z);
    const pBR = Perspective3D.project(laneX + halfW, 0, z);
    const pTL = Perspective3D.project(laneX - halfW, h, z);
    const pTR = Perspective3D.project(laneX + halfW, h, z);

    const barW = pBR.x - pBL.x;
    const barH = pBL.y - pTL.y;

    // Support legs
    const legThickness = Math.max(2, 4 * pBL.scale);
    this.graphics.lineStyle(legThickness, 0x475569, 1);
    this.graphics.lineBetween(pBL.x + 8 * pBL.scale, pBL.y, pTL.x + 8 * pTL.scale, pTL.y);
    this.graphics.lineBetween(pBR.x - 8 * pBR.scale, pBR.y, pTR.x - 8 * pTR.scale, pTR.y);

    // Barrier Crossbar
    this.graphics.fillStyle(0xffb703, 1); // Bright warning yellow
    this.graphics.fillRect(pTL.x, pTL.y, barW, barH * 0.65);

    // Hazard black stripes
    this.graphics.fillStyle(0x0f172a, 1);
    const stripeCount = 5;
    const stripeW = barW / (stripeCount * 2);
    for (let s = 0; s < stripeCount; s++) {
      this.graphics.fillRect(pTL.x + s * stripeW * 2, pTL.y, stripeW, barH * 0.65);
    }

    // Top flashing beacon light
    const pBeacon = Perspective3D.project(laneX, h + 8, z);
    const beaconR = Math.max(2, 6 * pBeacon.scale);
    this.graphics.fillStyle(0xe63946, 1);
    this.graphics.fillCircle(pBeacon.x, pBeacon.y, beaconR);
    this.graphics.fillStyle(0xffffff, 0.8);
    this.graphics.fillCircle(pBeacon.x, pBeacon.y, beaconR * 0.5);
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
