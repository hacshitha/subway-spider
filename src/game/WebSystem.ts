import Phaser from 'phaser';
import { Perspective3D } from '../rendering/Perspective3D';
import { PlayerState } from './PlayerController';

export type WebCycleState =
  | 'WEB_READY'
  | 'WEB_SHOOTING'
  | 'WEB_ATTACHED'
  | 'SWINGING'
  | 'WEB_RELEASED';

export interface WebCycleUpdateResult {
  playerState: PlayerState;
  elevation: number;
  isCycleActive: boolean;
  justAttached?: boolean;
  justLanded?: boolean;
  landedOnTrain?: boolean;
}

export class WebSystem {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private webState: WebCycleState = 'WEB_READY';

  // Target Pipe in 3D world space
  private pipeZ: number = 0;
  private pipeLane: number = 0;
  private readonly PIPE_HEIGHT = 150;

  // Arc & Timing parameters
  private shootProgress: number = 0;
  private attachTimer: number = 0;
  private swingProgress: number = 0;
  public readonly SWING_DURATION = 0.50; // Snappy, heroic swing arc
  private releaseTimer: number = 0;

  // Elevation progression
  private startElevation: number = 0;
  private targetLandingElevation: number = 0;
  private apexBoost: number = 70;
  private willLandOnTrain: boolean = false;

  // Visual particles
  private sparkles: Array<{ x: number; y: number; vx: number; vy: number; alpha: number }> = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = this.scene.add.graphics();
    this.graphics.setDepth(25);
  }

  public reset(): void {
    this.webState = 'WEB_READY';
    this.shootProgress = 0;
    this.attachTimer = 0;
    this.swingProgress = 0;
    this.releaseTimer = 0;
    this.sparkles = [];
    this.graphics.clear();
  }

  public isReady(): boolean {
    return this.webState === 'WEB_READY';
  }

  public getWebState(): WebCycleState {
    return this.webState;
  }

  /**
   * Begins a full web cycle:
   * 1. Shoots web toward target pipe
   * 2. Attaches to overhead crossbar
   * 3. Swings player upward & forward in a smooth arc
   * 4. Releases cleanly onto train roof or track
   */
  public triggerWebCycle(
    targetPipeZ: number,
    targetLane: number,
    currentElevation: number,
    trainUnderLanding: boolean,
    trainRoofHeight: number = 85
  ): boolean {
    if (this.webState !== 'WEB_READY') return false;

    this.pipeZ = targetPipeZ;
    this.pipeLane = targetLane;
    this.startElevation = currentElevation;
    this.willLandOnTrain = trainUnderLanding;
    this.targetLandingElevation = trainUnderLanding ? trainRoofHeight : 0;
    this.apexBoost = Math.max(65, this.targetLandingElevation + 45 - this.startElevation);

    this.shootProgress = 0;
    this.attachTimer = 0.08;
    this.swingProgress = 0;
    this.releaseTimer = 0.10;
    this.webState = 'WEB_SHOOTING';

    return true;
  }

  public update(
    deltaSec: number,
    handPos: { x: number; y: number },
    worldSpeed: number
  ): WebCycleUpdateResult {
    // Pipe moves towards player with world speed
    if (this.webState !== 'WEB_READY') {
      this.pipeZ -= worldSpeed * deltaSec;
    }

    // Update particles
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const sp = this.sparkles[i];
      sp.x += sp.vx * deltaSec;
      sp.y += sp.vy * deltaSec;
      sp.alpha -= deltaSec * 3.5;
      if (sp.alpha <= 0) {
        this.sparkles.splice(i, 1);
      }
    }

    let returnPlayerState: PlayerState = PlayerState.ON_TRACK;
    let currentElev: number = this.startElevation;
    let justAttached = false;
    let justLanded = false;

    switch (this.webState) {
      case 'WEB_SHOOTING': {
        returnPlayerState = PlayerState.WEB_SHOOTING;
        this.shootProgress = Math.min(1, this.shootProgress + deltaSec * 14);
        if (this.shootProgress >= 1) {
          this.webState = 'WEB_ATTACHED';
          justAttached = true;
          this.spawnImpactSparkles(this.getAnchorScreenPoint());
        }
        currentElev = this.startElevation;
        break;
      }

      case 'WEB_ATTACHED': {
        returnPlayerState = PlayerState.WEB_ATTACHED;
        this.attachTimer -= deltaSec;
        if (this.attachTimer <= 0) {
          this.webState = 'SWINGING';
        }
        currentElev = this.startElevation;
        break;
      }

      case 'SWINGING': {
        returnPlayerState = PlayerState.SWINGING;
        this.swingProgress += deltaSec / this.SWING_DURATION;

        const u = Math.min(1, Math.max(0, this.swingProgress));
        // Smooth sinusoidal pendulum arc
        const heightArc = Math.sin(u * Math.PI) * this.apexBoost;
        currentElev = this.startElevation + (this.targetLandingElevation - this.startElevation) * u + heightArc;

        if (this.swingProgress >= 1.0) {
          this.webState = 'WEB_RELEASED';
          this.spawnImpactSparkles(handPos);
        }
        break;
      }

      case 'WEB_RELEASED': {
        this.releaseTimer -= deltaSec;
        currentElev = this.targetLandingElevation;

        if (this.willLandOnTrain) {
          returnPlayerState = PlayerState.LANDING_ON_TRAIN;
        } else {
          returnPlayerState = PlayerState.RETURNING_TO_TRACK;
        }

        if (this.releaseTimer <= 0) {
          this.webState = 'WEB_READY';
          justLanded = true;
          returnPlayerState = this.willLandOnTrain ? PlayerState.ON_TRAIN : PlayerState.ON_TRACK;
        }
        break;
      }

      case 'WEB_READY':
      default: {
        returnPlayerState = PlayerState.ON_TRACK;
        currentElev = 0;
        break;
      }
    }

    this.render(handPos);

    return {
      playerState: returnPlayerState,
      elevation: currentElev,
      isCycleActive: this.webState !== 'WEB_READY',
      justAttached,
      justLanded,
      landedOnTrain: this.willLandOnTrain
    };
  }

  private getAnchorScreenPoint(): { x: number; y: number } {
    const laneX = Perspective3D.getLaneWorldX(this.pipeLane);
    const p = Perspective3D.project(laneX, this.PIPE_HEIGHT, this.pipeZ);
    return { x: p.x, y: p.y };
  }

  private spawnImpactSparkles(pos: { x: number; y: number }): void {
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const speed = 60 + Math.random() * 80;
      this.sparkles.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0
      });
    }
  }

  private render(handPos: { x: number; y: number }): void {
    this.graphics.clear();

    if (this.webState === 'WEB_READY') {
      // Render remaining sparkles if any
      this.drawSparkles();
      return;
    }

    const anchor = this.getAnchorScreenPoint();

    // Calculate current web line end point
    let targetX = anchor.x;
    let targetY = anchor.y;

    if (this.webState === 'WEB_SHOOTING') {
      targetX = handPos.x + (anchor.x - handPos.x) * this.shootProgress;
      targetY = handPos.y + (anchor.y - handPos.y) * this.shootProgress;
    }

    if (this.webState !== 'WEB_RELEASED') {
      // 1. Glowing outer web strand
      this.graphics.lineStyle(4.5, 0x00f0ff, 0.45);
      this.graphics.lineBetween(handPos.x, handPos.y, targetX, targetY);

      // 2. Core crisp white web line
      this.graphics.lineStyle(2, 0xffffff, 0.95);
      this.graphics.lineBetween(handPos.x, handPos.y, targetX, targetY);

      // 3. Hand connection node
      this.graphics.fillStyle(0xffffff, 1);
      this.graphics.fillCircle(handPos.x, handPos.y, 3);

      // 4. Pipe anchor node
      if (this.webState === 'WEB_ATTACHED' || this.webState === 'SWINGING') {
        this.graphics.fillStyle(0xffb703, 0.9);
        this.graphics.fillCircle(anchor.x, anchor.y, 6);
        this.graphics.fillStyle(0xffffff, 1);
        this.graphics.fillCircle(anchor.x, anchor.y, 3);
      }
    }

    this.drawSparkles();
  }

  private drawSparkles(): void {
    for (const sp of this.sparkles) {
      this.graphics.fillStyle(0x00f0ff, sp.alpha);
      this.graphics.fillCircle(sp.x, sp.y, 2.5);
    }
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
