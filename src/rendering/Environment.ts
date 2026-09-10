import Phaser from 'phaser';
import { Perspective3D } from './Perspective3D';

export class Environment {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private trackOffsetZ: number = 0;
  private overheadOffsetZ: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = this.scene.add.graphics();
    this.graphics.setDepth(-100);
  }

  private currentSpeed: number = 540;

  private cloudOffsetX: number = 0;

  public update(speed: number, deltaSec: number): void {
    this.currentSpeed = speed;
    const moveDist = speed * deltaSec;
    this.trackOffsetZ = (this.trackOffsetZ - moveDist) % 40;
    this.overheadOffsetZ = (this.overheadOffsetZ - moveDist) % 220;
    this.cloudOffsetX = (this.cloudOffsetX + deltaSec * 8) % 800;

    this.render();
  }

  private render(): void {
    this.graphics.clear();

    const w = Perspective3D.VIEW_WIDTH;
    const h = Perspective3D.VIEW_HEIGHT;
    const vy = Perspective3D.VANISHING_Y;

    // 1. Bright, vibrant daytime sky gradient
    this.graphics.fillGradientStyle(
      0x0284c7, 0x38bdf8, // Top rich superhero cyan-sky
      0xbae6fd, 0xf0f9ff, // Bottom crisp bright horizon
      1
    );
    this.graphics.fillRect(0, 0, w, vy + 10);

    // Subtle sun glow at horizon
    this.graphics.fillStyle(0xfffbeb, 0.45);
    this.graphics.fillCircle(w / 2, vy - 15, 75);
    this.graphics.fillStyle(0xffffff, 0.65);
    this.graphics.fillCircle(w / 2, vy - 15, 42);

    // Stylized soft daytime clouds drifting
    this.graphics.fillStyle(0xffffff, 0.55);
    const clouds = [
      { x: (120 - this.cloudOffsetX * 0.4 + 800) % 800, y: 45, r: 24, w: 90 },
      { x: (360 - this.cloudOffsetX * 0.3 + 800) % 800, y: 70, r: 28, w: 120 },
      { x: (620 - this.cloudOffsetX * 0.5 + 800) % 800, y: 55, r: 22, w: 85 }
    ];
    for (const c of clouds) {
      this.graphics.fillRoundedRect(c.x - c.w / 2, c.y, c.w, c.r * 1.3, c.r);
      this.graphics.fillCircle(c.x - 14, c.y + 4, c.r);
      this.graphics.fillCircle(c.x + 16, c.y + 2, c.r * 0.85);
    }

    // 2. Multi-Layered Stylized New York / Urban Skyline
    // Layer A: Distant sky-blue silhouette towers with beacon lights
    this.graphics.fillStyle(0x7dd3fc, 0.5);
    const distantTowers = [
      { x: 30, w: 55, h: 90 },
      { x: 100, w: 45, h: 120, spire: true },
      { x: 160, w: 70, h: 85 },
      { x: 250, w: 50, h: 105 },
      { x: 490, w: 60, h: 115, spire: true },
      { x: 570, w: 48, h: 95 },
      { x: 640, w: 75, h: 130, spire: true },
      { x: 730, w: 50, h: 80 }
    ];
    for (const dt of distantTowers) {
      this.graphics.fillRect(dt.x, vy - dt.h, dt.w, dt.h);
      if (dt.spire) {
        this.graphics.fillRect(dt.x + dt.w / 2 - 1.5, vy - dt.h - 18, 3, 18);
        this.graphics.fillStyle(0xe11d48, 0.8);
        this.graphics.fillCircle(dt.x + dt.w / 2, vy - dt.h - 18, 2.5);
        this.graphics.fillStyle(0x7dd3fc, 0.5);
      }
    }

    // Layer B: Midground urban skyscrapers with windows
    this.graphics.fillStyle(0x38bdf8, 0.75);
    const midBuildings = [
      { x: 70, w: 50, h: 70 },
      { x: 135, w: 65, h: 95 },
      { x: 215, w: 44, h: 60 },
      { x: 280, w: 56, h: 80 },
      { x: 460, w: 62, h: 85 },
      { x: 535, w: 50, h: 100 },
      { x: 600, w: 68, h: 75 },
      { x: 685, w: 46, h: 55 }
    ];
    for (const b of midBuildings) {
      this.graphics.fillRect(b.x, vy - b.h, b.w, b.h);
      // Clean, bright window rows
      this.graphics.fillStyle(0xffffff, 0.6);
      for (let wy = vy - b.h + 8; wy < vy - 6; wy += 11) {
        for (let wx = b.x + 7; wx < b.x + b.w - 7; wx += 9) {
          this.graphics.fillRect(wx, wy, 4, 5);
        }
      }
      this.graphics.fillStyle(0x38bdf8, 0.75);
    }

    // Layer C: Elevated bridge truss spans & suspension cables
    this.graphics.lineStyle(2, 0x0284c7, 0.45);
    this.graphics.lineBetween(0, vy - 28, 240, vy - 4);
    this.graphics.lineBetween(w, vy - 28, w - 240, vy - 4);
    for (let bx = 30; bx < 220; bx += 35) {
      this.graphics.lineBetween(bx, vy - 25, bx, vy);
    }
    for (let bx = w - 30; bx > w - 220; bx -= 35) {
      this.graphics.lineBetween(bx, vy - 25, bx, vy);
    }

    // 3. Bright, clean railway ballast ground
    this.graphics.fillGradientStyle(
      0xe2e8f0, 0xe2e8f0,
      0xcbd5e1, 0x94a3b8,
      1
    );
    this.graphics.fillRect(0, vy, w, h - vy);

    // Track platform edges (clean metallic curbs with bright yellow tactile caution lines)
    const pLeftFar = Perspective3D.project(-250, 0, Perspective3D.MAX_Z);
    const pLeftNear = Perspective3D.project(-250, 0, 10);
    const pRightFar = Perspective3D.project(250, 0, Perspective3D.MAX_Z);
    const pRightNear = Perspective3D.project(250, 0, 10);

    // Platform roadbed edge
    this.graphics.lineStyle(6, 0x94a3b8, 0.7);
    this.graphics.lineBetween(pLeftFar.x - 2, pLeftFar.y, pLeftNear.x - 2, pLeftNear.y);
    this.graphics.lineBetween(pRightFar.x + 2, pRightFar.y, pRightNear.x + 2, pRightNear.y);

    // Bright yellow caution safety line
    this.graphics.lineStyle(4, 0xffb703, 0.95);
    this.graphics.lineBetween(pLeftFar.x, pLeftFar.y, pLeftNear.x, pLeftNear.y);
    this.graphics.lineBetween(pRightFar.x, pRightFar.y, pRightNear.x, pRightNear.y);

    // 4. Railroad ties (sleepers) scrolling smoothly towards player
    const tieSpacing = 35;
    for (let z = 20 + ((this.trackOffsetZ % tieSpacing) + tieSpacing) % tieSpacing; z < Perspective3D.MAX_Z; z += tieSpacing) {
      const p1 = Perspective3D.project(-220, 0, z);
      const p2 = Perspective3D.project(220, 0, z);
      const tieThickness = Math.max(1, 6 * p1.scale);

      this.graphics.lineStyle(tieThickness, 0x334155, 0.65);
      this.graphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }

    // 5. Steel Rails (2 rails per lane, 3 lanes = 6 rails)
    const lanes = [-1, 0, 1];
    const railHalfGauge = 22; // half width of track

    for (const lane of lanes) {
      const laneCenterX = Perspective3D.getLaneWorldX(lane);

      for (const side of [-1, 1]) {
        const railWorldX = laneCenterX + side * railHalfGauge;
        const pFar = Perspective3D.project(railWorldX, 0, Perspective3D.MAX_Z);
        const pNear = Perspective3D.project(railWorldX, 0, 10);

        // Steel rail shadow/base
        this.graphics.lineStyle(3.5, 0x1e293b, 0.75);
        this.graphics.lineBetween(pFar.x, pFar.y, pNear.x, pNear.y);

        // Gleaming polished steel rail top
        this.graphics.lineStyle(2, 0xf8fafc, 0.98);
        this.graphics.lineBetween(pFar.x, pFar.y - 1, pNear.x, pNear.y - 1);
      }
    }

    // 6. Overhead Arched Metal Pipes / Gantry Trusses
    const pipeSpacing = 220;
    for (let z = 40 + ((this.overheadOffsetZ % pipeSpacing) + pipeSpacing) % pipeSpacing; z < Perspective3D.MAX_Z; z += pipeSpacing) {
      this.drawOverheadPipe(z);
    }

    // 7. High-Speed Wind / Motion Streaks (when speed > 720)
    if (this.currentSpeed > 720) {
      const intensity = Math.min(1.0, (this.currentSpeed - 720) / 450);
      const streakCount = Math.floor(4 + intensity * 6);
      this.graphics.lineStyle(1.5, 0x00f0ff, 0.35 * intensity);

      for (let i = 0; i < streakCount; i++) {
        // Left side streaks
        const yL = 190 + ((i * 57 + this.overheadOffsetZ * 4) % 350);
        const lenL = 30 + (i * 19) % 45;
        const xL = 12 + (i * 11) % 40;
        this.graphics.lineBetween(xL, yL, xL + lenL * 0.35, yL + lenL);

        // Right side streaks
        const yR = 190 + (((i + 3) * 61 + this.overheadOffsetZ * 4) % 350);
        const lenR = 30 + (i * 23) % 45;
        const xR = w - 12 - (i * 11) % 40;
        this.graphics.lineBetween(xR, yR, xR - lenR * 0.35, yR + lenR);
      }
    }
  }

  private targetedPipeZ: number | null = null;
  private isPipeAttached: boolean = false;
  private targetedLane: number = 0;

  public setTargetedPipe(z: number | null, isAttached: boolean = false, lane: number = 0): void {
    this.targetedPipeZ = z;
    this.isPipeAttached = isAttached;
    this.targetedLane = lane;
  }

  public getOverheadPipes(): number[] {
    const pipes: number[] = [];
    const pipeSpacing = 220;
    for (let z = 40 + ((this.overheadOffsetZ % pipeSpacing) + pipeSpacing) % pipeSpacing; z < Perspective3D.MAX_Z; z += pipeSpacing) {
      pipes.push(z);
    }
    return pipes;
  }

  public getNearestPipeAhead(playerZ: number = Perspective3D.PLAYER_Z, minDistance: number = 50, maxDistance: number = 440): number | null {
    const pipes = this.getOverheadPipes();
    let bestPipe: number | null = null;
    let minDiff = Infinity;

    for (const z of pipes) {
      const dist = z - playerZ;
      if (dist >= minDistance && dist <= maxDistance) {
        if (dist < minDiff) {
          minDiff = dist;
          bestPipe = z;
        }
      }
    }
    return bestPipe;
  }

  private drawOverheadPipe(z: number): void {
    const pipeHeight = 150; // elevated above ground
    const pipeWidth = 240;

    // Left pillar base & top
    const pLeftBase = Perspective3D.project(-pipeWidth, 0, z);
    const pLeftTop = Perspective3D.project(-pipeWidth, pipeHeight, z);

    // Right pillar base & top
    const pRightBase = Perspective3D.project(pipeWidth, 0, z);
    const pRightTop = Perspective3D.project(pipeWidth, pipeHeight, z);

    const thickness = Math.max(2, 10 * pLeftBase.scale);

    // Metallic truss pillars (Blue & silver arcade aesthetic)
    this.graphics.lineStyle(thickness, 0x0284c7, 0.85);
    this.graphics.lineBetween(pLeftBase.x, pLeftBase.y, pLeftTop.x, pLeftTop.y);
    this.graphics.lineBetween(pRightBase.x, pRightBase.y, pRightTop.x, pRightTop.y);

    // Overhead crossbar pipe
    this.graphics.lineStyle(thickness * 1.2, 0x38bdf8, 0.9);
    this.graphics.lineBetween(pLeftTop.x, pLeftTop.y, pRightTop.x, pRightTop.y);

    // Caution stripes / yellow accent on crossbar
    this.graphics.lineStyle(thickness * 0.4, 0xffb703, 1);
    this.graphics.lineBetween(pLeftTop.x + 10 * pLeftTop.scale, pLeftTop.y - 2, pRightTop.x - 10 * pRightTop.scale, pRightTop.y - 2);

    // Check if this pipe is targeted / attached to a web
    const isThisPipeTargeted = this.targetedPipeZ !== null && Math.abs(this.targetedPipeZ - z) < 20;
    if (isThisPipeTargeted) {
      const pAnchor = Perspective3D.project(
        Perspective3D.getLaneWorldX(this.targetedLane),
        pipeHeight,
        z
      );
      const ringRadius = Math.max(4, 12 * pAnchor.scale);

      // Glowing anchor node ring
      this.graphics.lineStyle(3, this.isPipeAttached ? 0xffb703 : 0x00f0ff, 0.9);
      this.graphics.strokeCircle(pAnchor.x, pAnchor.y, ringRadius);
      this.graphics.fillStyle(this.isPipeAttached ? 0xffffff : 0x00f0ff, 0.8);
      this.graphics.fillCircle(pAnchor.x, pAnchor.y, ringRadius * 0.5);
    }

    // Overhead hanging signals / lights
    for (const lane of [-1, 0, 1]) {
      const pSignal = Perspective3D.project(Perspective3D.getLaneWorldX(lane), pipeHeight - 12, z);
      const radius = Math.max(1.5, 5 * pSignal.scale);
      this.graphics.fillStyle(0x00f0ff, 0.9);
      this.graphics.fillCircle(pSignal.x, pSignal.y, radius);
    }
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
