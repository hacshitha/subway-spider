import { Perspective3D } from '../rendering/Perspective3D';

export class LaneSystem {
  private targetLane: -1 | 0 | 1 = 0;
  private currentWorldX: number = 0;
  private readonly BASE_SWITCH_SPEED = 24.0; // Snappy, immediate arcade dodge response

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.targetLane = 0;
    this.currentWorldX = 0;
  }

  public setLane(lane: -1 | 0 | 1): void {
    this.targetLane = Math.max(-1, Math.min(1, lane)) as -1 | 0 | 1;
  }

  public shiftLeft(): void {
    if (this.targetLane > -1) {
      this.targetLane = (this.targetLane - 1) as -1 | 0 | 1;
    }
  }

  public shiftRight(): void {
    if (this.targetLane < 1) {
      this.targetLane = (this.targetLane + 1) as -1 | 0 | 1;
    }
  }

  public update(deltaSec: number, currentSpeed: number = 540): void {
    const targetX = Perspective3D.getLaneWorldX(this.targetLane);
    // Dynamically scale switch speed with forward momentum so reaction feels instant
    const dynamicSwitchSpeed = this.BASE_SWITCH_SPEED + Math.max(0, (currentSpeed - 540) * 0.010);
    const factor = 1.0 - Math.exp(-dynamicSwitchSpeed * deltaSec);
    this.currentWorldX += (targetX - this.currentWorldX) * factor;
  }

  public getCurrentWorldX(): number {
    return this.currentWorldX;
  }

  public getTargetLane(): -1 | 0 | 1 {
    return this.targetLane;
  }

  public isNearTarget(): boolean {
    const targetX = Perspective3D.getLaneWorldX(this.targetLane);
    return Math.abs(this.currentWorldX - targetX) < 15;
  }
}
