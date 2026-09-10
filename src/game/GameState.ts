export class GameState {
  public score: number = 0;
  public highScore: number = 0;
  public coins: number = 0;
  public distance: number = 0;
  public currentSpeed: number = 540;
  public isGameOver: boolean = false;
  public isPlaying: boolean = false;
  public isPaused: boolean = false;
  public controlMode: 'camera' | 'keyboard' = 'camera';

  // Progressive Speed Curve (Smooth, controlled progression)
  // START (Comfortable): ~540
  // EARLY GAME (15-30s): ~700-800
  // MID GAME (35-60s): ~900-1050
  // LATE GAME (75s+): ~1150-1250
  private readonly INITIAL_SPEED = 540;
  private readonly MAX_SPEED = 1250;
  private readonly ACCELERATION_BASE = 9.5; // Progressive acceleration per second

  constructor() {
    this.loadHighScore();
  }

  public start(): void {
    this.score = 0;
    this.coins = 0;
    this.distance = 0;
    this.currentSpeed = this.INITIAL_SPEED;
    this.isGameOver = false;
    this.isPlaying = true;
    this.isPaused = false;
  }

  public pause(): void {
    if (this.isPlaying && !this.isGameOver) {
      this.isPaused = true;
    }
  }

  public resume(): void {
    this.isPaused = false;
  }

  public togglePause(): boolean {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
    return this.isPaused;
  }

  public setControlMode(mode: 'camera' | 'keyboard'): void {
    this.controlMode = mode;
  }

  public update(deltaSec: number): void {
    if (!this.isPlaying || this.isGameOver || this.isPaused) return;

    // Distance and score progression
    const traveled = this.currentSpeed * deltaSec;
    this.distance += traveled;
    this.score += Math.floor(traveled * 0.12);

    // Gradual difficulty curve:
    // Rate of acceleration eases as speed approaches max to prevent abrupt spikes
    if (this.currentSpeed < this.MAX_SPEED) {
      const remainingRatio = Math.max(0.1, (this.MAX_SPEED - this.currentSpeed) / (this.MAX_SPEED - this.INITIAL_SPEED));
      this.currentSpeed += this.ACCELERATION_BASE * remainingRatio * deltaSec;
    }

    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }
  }

  /**
   * Returns a normalized difficulty factor from 0.0 (start) to 1.0 (late game)
   */
  public getDifficulty(): number {
    return Math.min(1.0, Math.max(0.0, (this.currentSpeed - this.INITIAL_SPEED) / (this.MAX_SPEED - this.INITIAL_SPEED)));
  }

  public addCoin(value: number = 1): void {
    this.coins += value;
    this.score += value * 60;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }
  }

  public triggerGameOver(): void {
    this.isGameOver = true;
    this.isPlaying = false;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }
  }

  private loadHighScore(): void {
    try {
      const saved = localStorage.getItem('subway_spider_highscore');
      this.highScore = saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      this.highScore = 0;
    }
  }

  private saveHighScore(): void {
    try {
      localStorage.setItem('subway_spider_highscore', this.highScore.toString());
    } catch {
      // ignore
    }
  }
}
