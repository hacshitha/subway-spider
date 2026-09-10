import Phaser from 'phaser';
import { Perspective3D } from '../rendering/Perspective3D';
import { PlayerRenderer } from '../rendering/PlayerRenderer';

export enum PlayerState {
  ON_TRACK = 'ON_TRACK',
  JUMPING = 'JUMPING',
  WEB_READY = 'WEB_READY',
  WEB_SHOOTING = 'WEB_SHOOTING',
  WEB_ATTACHED = 'WEB_ATTACHED',
  SWINGING = 'SWINGING',
  LANDING_ON_TRAIN = 'LANDING_ON_TRAIN',
  ON_TRAIN = 'ON_TRAIN',
  LEAVING_TRAIN = 'LEAVING_TRAIN',
  RETURNING_TO_TRACK = 'RETURNING_TO_TRACK',
  GAME_OVER = 'GAME_OVER'
}

export interface PlayerCustomization {
  suitBaseColor: number;    // Primary suit red (0xe11d48)
  suitSecondaryColor: number;// Suit navy (0x1e293b)
  hasJacket: boolean;       // Subway-runner jacket style
  jacketColor: number;      // Off-white / cream (0xf8fafc)
  jacketAccentColor: number;// Light blue (0x38bdf8)
}

export class PlayerController {
  private scene: Phaser.Scene;
  private renderer: PlayerRenderer;

  // State
  private currentState: PlayerState = PlayerState.ON_TRACK;
  private elevation: number = 0;       // Height above ground (0 = track, 85 = roof)
  private verticalVelocity: number = 0; // Upward velocity
  private currentBaseHeight: number = 0;// Target landing elevation (0 or 85)
  private currentTrainId: number | null = null;

  // Hand screen coordinates for web origin
  public handScreenX: number = 0;
  public handScreenY: number = 0;

  // Physics constants
  private readonly JUMP_FORCE = 415; // Generous headroom to clear barriers effortlessly
  private readonly GRAVITY = -1050;

  // Customization config for character appearance
  private customization: PlayerCustomization = {
    suitBaseColor: 0xe11d48, // Vibrant superhero crimson red
    suitSecondaryColor: 0x1e293b, // Deep navy athletic pants
    hasJacket: true, // Cream subway runner jacket
    jacketColor: 0xf8fafc, // Off-white / cream jacket body
    jacketAccentColor: 0x38bdf8 // Light blue accent panels & trim
  };

  // Cached screen position
  public screenX: number = 0;
  public screenY: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.renderer = new PlayerRenderer(this.scene);
    this.reset();
  }

  public reset(): void {
    this.currentState = PlayerState.ON_TRACK;
    this.elevation = 0;
    this.verticalVelocity = 0;
    this.currentBaseHeight = 0;
    this.currentTrainId = null;
    this.renderer.reset();
  }

  public jump(): boolean {
    if (this.currentState === PlayerState.GAME_OVER) return false;
    // Don't interrupt active web swinging
    if (
      this.currentState === PlayerState.WEB_SHOOTING ||
      this.currentState === PlayerState.WEB_ATTACHED ||
      this.currentState === PlayerState.SWINGING
    ) {
      return false;
    }

    // Allowed to jump if on track or on train roof
    if (
      this.currentState === PlayerState.ON_TRACK ||
      this.currentState === PlayerState.ON_TRAIN ||
      (this.currentState === PlayerState.JUMPING && this.elevation < 25)
    ) {
      this.verticalVelocity = this.JUMP_FORCE;
      this.currentState = PlayerState.JUMPING;
      return true;
    }
    return false;
  }

  public triggerLanding(): void {
    this.renderer.triggerLanding();
  }

  public setTrainRoofState(roofElevation: number, trainId?: number): void {
    if (this.currentState === PlayerState.GAME_OVER) return;

    this.currentBaseHeight = roofElevation;
    if (trainId !== undefined) {
      this.currentTrainId = trainId;
    }

    if (this.currentState === PlayerState.JUMPING || this.currentState === PlayerState.SWINGING) {
      this.currentState = PlayerState.LANDING_ON_TRAIN;
      this.triggerLanding();
    } else {
      this.currentState = PlayerState.ON_TRAIN;
    }
  }

  public leaveTrainRoof(): void {
    if (this.currentState === PlayerState.ON_TRAIN) {
      this.currentState = PlayerState.LEAVING_TRAIN;
      this.currentBaseHeight = 0;
      this.currentTrainId = null;
      // Gravity / momentum pulls player down towards track
      this.verticalVelocity = Math.min(-30, this.verticalVelocity);
    }
  }

  public triggerGameOver(): void {
    this.currentState = PlayerState.GAME_OVER;
  }

  public setState(state: PlayerState): void {
    this.currentState = state;
  }

  public setElevation(elev: number): void {
    this.elevation = elev;
  }

  public getElevation(): number {
    return this.elevation;
  }

  public getState(): PlayerState {
    return this.currentState;
  }

  public getCurrentTrainId(): number | null {
    return this.currentTrainId;
  }

  public setCurrentTrainId(id: number | null): void {
    this.currentTrainId = id;
  }

  public getHandScreenPos(): { x: number; y: number } {
    return { x: this.handScreenX, y: this.handScreenY };
  }

  public update(deltaSec: number, worldX: number, currentSpeed: number): void {
    if (this.currentState === PlayerState.GAME_OVER) {
      this.render(worldX, currentSpeed, deltaSec);
      return;
    }

    // In web states, elevation is governed by WebSystem
    const isWebDriven =
      this.currentState === PlayerState.WEB_SHOOTING ||
      this.currentState === PlayerState.WEB_ATTACHED ||
      this.currentState === PlayerState.SWINGING;

    if (isWebDriven) {
      this.render(worldX, currentSpeed, deltaSec);
      return;
    }

    // Vertical Physics (Jump / Fall / Leave Train)
    if (
      this.currentState === PlayerState.JUMPING ||
      this.currentState === PlayerState.LEAVING_TRAIN ||
      this.currentState === PlayerState.RETURNING_TO_TRACK ||
      this.elevation > this.currentBaseHeight
    ) {
      this.verticalVelocity += this.GRAVITY * deltaSec;
      this.elevation += this.verticalVelocity * deltaSec;

      // Landing check
      if (this.elevation <= this.currentBaseHeight) {
        this.elevation = this.currentBaseHeight;
        if (this.verticalVelocity < -50) {
          this.triggerLanding();
        }
        this.verticalVelocity = 0;

        if (this.currentBaseHeight > 0) {
          this.currentState = PlayerState.ON_TRAIN;
        } else {
          this.currentState = PlayerState.ON_TRACK;
        }
      }
    } else {
      this.elevation = this.currentBaseHeight;
      this.verticalVelocity = 0;
      if (this.currentBaseHeight > 0) {
        this.currentState = PlayerState.ON_TRAIN;
      } else {
        this.currentState = PlayerState.ON_TRACK;
      }
    }

    this.render(worldX, currentSpeed, deltaSec);
  }

  private render(worldX: number, currentSpeed: number, deltaSec: number): void {
    this.renderer.updateAndRender(
      {
        worldX,
        elevation: this.elevation,
        baseHeight: this.currentBaseHeight,
        verticalVelocity: this.verticalVelocity,
        currentSpeed,
        state: this.currentState,
        deltaSec
      },
      this.customization
    );

    // Synchronize hand screen coordinates from renderer
    this.handScreenX = this.renderer.handScreenX;
    this.handScreenY = this.renderer.handScreenY;

    // Cache project coordinates
    const p = Perspective3D.project(worldX, this.elevation, Perspective3D.PLAYER_Z);
    this.screenX = p.x;
    this.screenY = p.y;
  }

  public setCustomization(options: Partial<PlayerCustomization>): void {
    this.customization = { ...this.customization, ...options };
  }

  public destroy(): void {
    this.renderer.destroy();
  }
}
