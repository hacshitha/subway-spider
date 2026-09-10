import Phaser from 'phaser';
import { Perspective3D } from '../rendering/Perspective3D';

export interface Coin {
  id: number;
  lane: -1 | 0 | 1;
  elevation: number; // 0 for ground level, 85 for train roof, or arc height
  z: number;
  collected: boolean;
}

export interface CoinParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: number;
  size: number;
}

export class CoinSystem {
  private scene: Phaser.Scene;
  private coins: Coin[] = [];
  private particles: CoinParticle[] = [];
  private nextId: number = 1;
  private spawnTimer: number = 0.8;
  private graphics: Phaser.GameObjects.Graphics;
  private spinAngle: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = this.scene.add.graphics();
    this.graphics.setDepth(15);
  }

  public reset(): void {
    this.coins = [];
    this.particles = [];
    this.spawnTimer = 0.5;
    this.graphics.clear();
  }

  public update(
    speed: number,
    deltaSec: number,
    trains: Array<{ lane: -1 | 0 | 1; frontZ: number; length: number; height: number }>
  ): void {
    const moveDist = speed * deltaSec;
    this.spinAngle += deltaSec * 5.0;

    // Move coins forward
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.z -= moveDist;

      if (coin.z < 0 || coin.collected) {
        this.coins.splice(i, 1);
      }
    }

    // Update coin particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * deltaSec;
      p.y += p.vy * deltaSec;
      p.vy += 220 * deltaSec; // gravity
      p.alpha -= deltaSec * 2.5;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Spawn coin patterns
    this.spawnTimer -= deltaSec;
    if (this.spawnTimer <= 0) {
      this.spawnPattern(trains);
      this.spawnTimer = 1.2 + Math.random() * 1.2;
    }

    this.render();
  }

  private spawnPattern(
    trains: Array<{ lane: -1 | 0 | 1; frontZ: number; length: number; height: number }>
  ): void {
    const lane = ([-1, 0, 1] as (-1 | 0 | 1)[])[Math.floor(Math.random() * 3)];
    const startZ = Perspective3D.MAX_Z + 50;

    // Check if there is a train at horizon on this lane
    const trainOnLane = trains.find(t => t.lane === lane && t.frontZ > 700);

    if (trainOnLane) {
      // Spawn rooftop coin line!
      for (let i = 0; i < 5; i++) {
        this.coins.push({
          id: this.nextId++,
          lane: lane,
          elevation: trainOnLane.height + 15,
          z: startZ + i * 45,
          collected: false
        });
      }
    } else {
      // Ground coin pattern or small arc
      const isArc = Math.random() > 0.6;
      for (let i = 0; i < 5; i++) {
        let elev = 15;
        if (isArc) {
          // Parabolic jump arc
          elev = 15 + Math.sin((i / 4) * Math.PI) * 45;
        }
        this.coins.push({
          id: this.nextId++,
          lane: lane,
          elevation: elev,
          z: startZ + i * 42,
          collected: false
        });
      }
    }
  }

  /**
   * Checks coin collisions with player.
   * Returns count of collected coins.
   */
  public checkCollection(
    playerWorldX: number,
    playerElevation: number,
    playerZ: number = Perspective3D.PLAYER_Z
  ): number {
    let collectedCount = 0;

    for (const coin of this.coins) {
      if (coin.collected) continue;

      const laneX = Perspective3D.getLaneWorldX(coin.lane);
      const dx = Math.abs(playerWorldX - laneX);
      const dz = Math.abs(playerZ - coin.z);
      const dy = Math.abs(playerElevation - coin.elevation);

      // Collection radius (widened for high-speed precision)
      if (dx < 38 && dz < 50 && dy < 52) {
        coin.collected = true;
        collectedCount++;

        // Spawn burst particles at coin projection
        const pScreen = Perspective3D.project(laneX, coin.elevation, coin.z);
        this.createPickupBurst(pScreen.x, pScreen.y);
      }
    }

    return collectedCount;
  }

  private createPickupBurst(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const speed = 70 + Math.random() * 80;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        alpha: 1.0,
        color: Math.random() > 0.4 ? 0xffb703 : 0xffffff,
        size: 3 + Math.random() * 3
      });
    }
  }

  private render(): void {
    this.graphics.clear();

    // Draw coins
    for (const coin of this.coins) {
      if (coin.collected) continue;
      this.drawCoin(coin);
    }

    // Draw particles
    for (const p of this.particles) {
      this.graphics.fillStyle(p.color, p.alpha);
      this.graphics.fillCircle(p.x, p.y, p.size);
    }
  }

  private drawCoin(coin: Coin): void {
    const laneX = Perspective3D.getLaneWorldX(coin.lane);
    const z = Math.max(10, coin.z);
    // Subtle hover bob
    const hoverY = coin.elevation + Math.sin(this.spinAngle * 2 + coin.id) * 3;
    const p = Perspective3D.project(laneX, hoverY, z);

    // 3D spinning ellipse effect
    const spinWidthFactor = Math.abs(Math.cos(this.spinAngle + coin.id * 0.5));
    const baseRadius = Math.max(3, 13 * p.scale);
    const rx = Math.max(2, baseRadius * spinWidthFactor);
    const ry = baseRadius;

    // Golden Outer Glow / Border
    this.graphics.fillStyle(0xd97706, 0.9);
    this.graphics.fillEllipse(p.x, p.y, rx * 2.2, ry * 2.2);

    // Bright Gold Coin Face
    this.graphics.fillStyle(0xffb703, 1);
    this.graphics.fillEllipse(p.x, p.y, rx * 2, ry * 2);

    // Specular highlight gleam
    this.graphics.fillStyle(0xffffff, 0.85);
    this.graphics.fillEllipse(p.x - rx * 0.3, p.y - ry * 0.3, rx * 0.8, ry * 0.6);

    // Center spider-coin star emblem
    if (rx > 5) {
      this.graphics.fillStyle(0xb45309, 0.8);
      this.graphics.fillCircle(p.x, p.y, rx * 0.35);
    }
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
