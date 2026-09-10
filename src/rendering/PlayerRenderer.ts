import Phaser from 'phaser';
import { Perspective3D } from './Perspective3D';
import { PlayerState, PlayerCustomization } from '../game/PlayerController';

export interface RenderContext {
  worldX: number;
  elevation: number;
  baseHeight: number;
  verticalVelocity: number;
  currentSpeed: number;
  state: PlayerState;
  deltaSec: number;
}

/**
 * PlayerRenderer
 * Renders the full-body Spider-Man superhero character using real 2D sprite frames
 * loaded from an external PNG sprite sheet (assets/player_spritesheet.png).
 * 
 * Frame Layout:
 * - 160 x 200 pixels per frame (4 columns x 4 rows)
 * - Origin: (0.50, 0.94) -> (80, 188) in frame where sneaker soles touch the ground
 * - Frame 0..7: 8-frame fluid running cycle
 * - Frame 8: Jump Rising (takeoff leap)
 * - Frame 9: Jump Falling (descent)
 * - Frame 10: Landing impact squash
 * - Frame 11: Web Shooting (right arm outstretched forward-upward)
 * - Frame 12: Web Attached (gripping taut line)
 * - Frame 13: Swinging (holding web overhead, legs swept back)
 * - Frame 14: Train Roof running
 * - Frame 15: Leaving train (stepping into air)
 */
export class PlayerRenderer {
  public static readonly TEXTURE_KEY = 'player_spider';
  public static readonly FRAME_WIDTH = 160;
  public static readonly FRAME_HEIGHT = 200;
  public static readonly ORIGIN_X = 0.50;
  public static readonly ORIGIN_Y = 0.94; // 188 / 200 = sneaker sole surface contact

  // Hand pixel offsets relative to (80, 188) in cell
  public static readonly WEB_SHOOT_HAND_OFFSET = { x: 38, y: -152 };
  public static readonly SWING_HAND_OFFSET = { x: 18, y: -168 };

  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private shadowGraphics: Phaser.GameObjects.Graphics;
  private effectsGraphics: Phaser.GameObjects.Graphics;

  // Animation timers
  private runCycleTime: number = 0;
  private landingSquashTimer: number = 0;
  private readonly LANDING_DURATION = 0.14; // seconds of squash on impact

  // Dynamic swinging pendulum angle
  private currentSwingAngle: number = 0;

  // Hand screen coordinates for web origin
  public handScreenX: number = 0;
  public handScreenY: number = 0;

  // Impact dust particles
  private dustPuffs: Array<{ x: number; y: number; vx: number; vy: number; radius: number; alpha: number }> = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // 1. Ensure animations are created for player_spider
    this.ensureAnimations();

    // 2. Soft ground contact shadow
    this.shadowGraphics = this.scene.add.graphics();
    this.shadowGraphics.setDepth(19);

    // 3. Main Player Character Sprite
    const textureKey = this.scene.textures.exists(PlayerRenderer.TEXTURE_KEY)
      ? PlayerRenderer.TEXTURE_KEY
      : '__DEFAULT';

    this.sprite = this.scene.add.sprite(0, 0, textureKey, 0);
    this.sprite.setOrigin(PlayerRenderer.ORIGIN_X, PlayerRenderer.ORIGIN_Y);
    this.sprite.setDepth(20);

    // 4. Foreground effects
    this.effectsGraphics = this.scene.add.graphics();
    this.effectsGraphics.setDepth(21);

    if (this.scene.anims.exists('player_run')) {
      this.sprite.play('player_run', true);
    }
  }

  private ensureAnimations(): void {
    const anims = this.scene.anims;
    const texKey = PlayerRenderer.TEXTURE_KEY;

    if (this.scene.textures.exists(texKey)) {
      if (!anims.exists('player_run')) {
        anims.create({
          key: 'player_run',
          frames: anims.generateFrameNumbers(texKey, { start: 0, end: 7 }),
          frameRate: 14,
          repeat: -1
        });
      }

      if (!anims.exists('player_train_run')) {
        anims.create({
          key: 'player_train_run',
          frames: anims.generateFrameNumbers(texKey, { start: 0, end: 7 }),
          frameRate: 16,
          repeat: -1
        });
      }
    }
  }

  public reset(): void {
    this.runCycleTime = 0;
    this.landingSquashTimer = 0;
    this.currentSwingAngle = 0;
    this.dustPuffs = [];
    this.shadowGraphics.clear();
    this.effectsGraphics.clear();
    this.sprite.setRotation(0);
    if (this.scene.anims.exists('player_run')) {
      this.sprite.play('player_run', true);
    }
  }

  public triggerLanding(): void {
    this.landingSquashTimer = this.LANDING_DURATION;
    const sx = this.sprite.x;
    const sy = this.sprite.y;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.random() - 0.5) * Math.PI;
      const speed = 35 + Math.random() * 45;
      this.dustPuffs.push({
        x: sx - 16 + Math.random() * 32,
        y: sy - 4,
        vx: Math.sin(angle) * speed,
        vy: -Math.abs(Math.cos(angle)) * speed * 0.45,
        radius: 4.0 + Math.random() * 4.0,
        alpha: 0.65
      });
    }
  }

  public updateAndRender(ctx: RenderContext, _customization: PlayerCustomization): void {
    const { worldX, elevation, baseHeight, verticalVelocity, currentSpeed, state, deltaSec } = ctx;

    // 1. Advance timers
    this.runCycleTime += deltaSec;
    if (this.landingSquashTimer > 0) {
      this.landingSquashTimer = Math.max(0, this.landingSquashTimer - deltaSec);
    }

    // 2. Update dust puffs
    for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
      const p = this.dustPuffs[i];
      p.x += p.vx * deltaSec;
      p.y += p.vy * deltaSec;
      p.alpha -= deltaSec * 3.8;
      p.radius += deltaSec * 9;
      if (p.alpha <= 0) {
        this.dustPuffs.splice(i, 1);
      }
    }

    // 3. Project 3D positions to 2.5D screen coordinates
    const z = Perspective3D.PLAYER_Z;
    const p = Perspective3D.project(worldX, elevation, z);
    const pGround = Perspective3D.project(worldX, baseHeight, z);

    // Scale character for arcade superhero presence (~95-100px tall)
    const baseScale = p.scale / 0.59375;
    const spriteScale = 0.65 * baseScale;

    this.sprite.setPosition(p.x, p.y);
    this.sprite.setScale(spriteScale);

    // 4. Update animation state & frame
    this.updateAnimationState(ctx, p.x, p.y, spriteScale);

    // 5. Render contact shadow beneath runner
    this.renderShadow(pGround.x, pGround.y, p.scale, elevation - baseHeight);

    // 6. Render dust puffs
    this.renderDustPuffs();
  }

  private updateAnimationState(
    ctx: RenderContext,
    screenX: number,
    screenY: number,
    spriteScale: number
  ): void {
    const { state, verticalVelocity, currentSpeed, deltaSec } = ctx;

    // Safety: ensure texture is assigned if it was loaded asynchronously
    if (this.sprite.texture.key !== PlayerRenderer.TEXTURE_KEY && this.scene.textures.exists(PlayerRenderer.TEXTURE_KEY)) {
      this.sprite.setTexture(PlayerRenderer.TEXTURE_KEY);
      this.ensureAnimations();
      if (this.scene.anims.exists('player_run')) {
        this.sprite.play('player_run', true);
      }
    }

    if (state === PlayerState.GAME_OVER) {
      this.sprite.stop();
      this.sprite.setFrame(9); // fall frame
      this.sprite.setRotation(-0.35); // knockback tilt
      this.handScreenX = screenX;
      this.handScreenY = screenY - 95 * spriteScale;
      return;
    }

    // --- WEB SWINGING STATE ---
    if (state === PlayerState.SWINGING) {
      this.sprite.stop();
      this.sprite.setFrame(13); // swinging pose

      // Smooth pendulum swing rotation (-20 to +20 degrees)
      const targetSwing = Math.sin(this.runCycleTime * 5.0) * 0.35;
      this.currentSwingAngle = Phaser.Math.Linear(
        this.currentSwingAngle,
        targetSwing,
        Math.min(1, deltaSec * 14)
      );
      this.sprite.setRotation(this.currentSwingAngle);

      // Exact hand coordinate with swing rotation
      const offset = PlayerRenderer.SWING_HAND_OFFSET;
      const cos = Math.cos(this.currentSwingAngle);
      const sin = Math.sin(this.currentSwingAngle);
      this.handScreenX = screenX + (offset.x * cos - offset.y * sin) * spriteScale;
      this.handScreenY = screenY + (offset.x * sin + offset.y * cos) * spriteScale;
      return;
    }

    // --- WEB SHOOTING STATE ---
    if (state === PlayerState.WEB_SHOOTING) {
      this.sprite.stop();
      this.sprite.setFrame(11); // web shoot pose (arm outstretched forward-upward)
      this.sprite.setRotation(0.04);

      const offset = PlayerRenderer.WEB_SHOOT_HAND_OFFSET;
      this.handScreenX = screenX + offset.x * spriteScale;
      this.handScreenY = screenY + offset.y * spriteScale;
      return;
    }

    // --- WEB ATTACHED STATE ---
    if (state === PlayerState.WEB_ATTACHED) {
      this.sprite.stop();
      this.sprite.setFrame(12); // web attached pose (holding taut line)
      this.sprite.setRotation(0.06);

      this.handScreenX = screenX + 32 * spriteScale;
      this.handScreenY = screenY - 158 * spriteScale;
      return;
    }

    // Reset swing angle when not swinging
    this.currentSwingAngle = 0;

    // Default resting hand position
    this.handScreenX = screenX + 18 * spriteScale;
    this.handScreenY = screenY - 95 * spriteScale;

    // --- LANDING SQUASH STATE ---
    if (this.landingSquashTimer > 0) {
      this.sprite.stop();
      this.sprite.setFrame(10); // landing impact compression
      this.sprite.setRotation(0);
      return;
    }

    // --- JUMPING & FALLING STATES ---
    if (state === PlayerState.JUMPING) {
      this.sprite.stop();
      if (verticalVelocity > 0) {
        this.sprite.setFrame(8); // rising leap pose
        this.sprite.setRotation(-0.04);
      } else {
        this.sprite.setFrame(9); // falling descent pose
        this.sprite.setRotation(0.08);
      }
      return;
    }

    // --- LEAVING TRAIN / RETURNING TO TRACK ---
    if (state === PlayerState.LEAVING_TRAIN || state === PlayerState.RETURNING_TO_TRACK) {
      this.sprite.stop();
      this.sprite.setFrame(15); // stepping off edge into air
      this.sprite.setRotation(0.12);
      return;
    }

    // --- ON TRAIN ROOF RUNNING ---
    if (state === PlayerState.ON_TRAIN) {
      if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim?.key !== 'player_train_run') {
        if (this.scene.anims.exists('player_train_run')) {
          this.sprite.play('player_train_run', true);
        }
      }
      // Speed up animation with forward velocity
      if (this.sprite.anims.isPlaying) {
        this.sprite.anims.timeScale = Math.max(1.15, currentSpeed / 480);
      }
      this.sprite.setRotation(0.08); // athletic forward lean into train headwind
      return;
    }

    // --- RUNNING & FAST RUNNING ON TRACK ---
    if (state === PlayerState.ON_TRACK) {
      if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim?.key !== 'player_run') {
        if (this.scene.anims.exists('player_run')) {
          this.sprite.play('player_run', true);
        }
      }

      const isFastRunning = currentSpeed > 720;
      if (isFastRunning) {
        if (this.sprite.anims.isPlaying) {
          this.sprite.anims.timeScale = Math.min(2.1, 1.35 + (currentSpeed - 720) * 0.0014);
        }
        this.sprite.setRotation(0.10);
      } else {
        if (this.sprite.anims.isPlaying) {
          this.sprite.anims.timeScale = Math.max(1.0, currentSpeed / 520);
        }
        this.sprite.setRotation(0.03);
      }
    }
  }

  private renderShadow(gx: number, gy: number, scale: number, heightAboveSurface: number): void {
    this.shadowGraphics.clear();

    const shadowRadius = Math.max(8, 30 * scale);
    const clampedHeight = Math.max(0, heightAboveSurface);
    const shadowAlpha = Math.max(0.12, 0.60 - clampedHeight * 0.0035);
    const shadowScale = Math.max(0.35, 1.0 - clampedHeight * 0.0040);

    this.shadowGraphics.fillStyle(0x070b14, shadowAlpha);
    this.shadowGraphics.fillEllipse(
      gx,
      gy,
      shadowRadius * 2.4 * shadowScale,
      shadowRadius * 0.75 * shadowScale
    );
  }

  private renderDustPuffs(): void {
    this.effectsGraphics.clear();
    if (this.dustPuffs.length === 0) return;

    for (const p of this.dustPuffs) {
      this.effectsGraphics.fillStyle(0xf1f5f9, p.alpha);
      this.effectsGraphics.fillCircle(p.x, p.y, p.radius);
    }
  }

  public destroy(): void {
    this.sprite.destroy();
    this.shadowGraphics.destroy();
    this.effectsGraphics.destroy();
  }
}
