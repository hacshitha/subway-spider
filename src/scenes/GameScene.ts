import Phaser from 'phaser';
import { Perspective3D } from '../rendering/Perspective3D';
import { Environment } from '../rendering/Environment';
import { LaneSystem } from '../game/LaneSystem';
import { PlayerController, PlayerState } from '../game/PlayerController';
import { TrainSystem } from '../game/TrainSystem';
import { ObstacleSystem } from '../game/ObstacleSystem';
import { CoinSystem } from '../game/CoinSystem';
import { WebSystem } from '../game/WebSystem';
import { GameState } from '../game/GameState';
import { AudioManager } from '../game/AudioManager';

export class GameScene extends Phaser.Scene {
  private environment!: Environment;
  private laneSystem!: LaneSystem;
  private playerController!: PlayerController;
  private trainSystem!: TrainSystem;
  private obstacleSystem!: ObstacleSystem;
  private coinSystem!: CoinSystem;
  private webSystem!: WebSystem;
  private gameState!: GameState;
  private audioManager!: AudioManager;

  // Keyboard controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyP!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  // Key debounce
  private leftDown: boolean = false;
  private rightDown: boolean = false;

  constructor() {
    super('GameScene');
  }

  public preload(): void {
    this.load.spritesheet('player_spider', 'assets/player_spritesheet.png', {
      frameWidth: 160,
      frameHeight: 200
    });
  }

  public create(): void {
    this.gameState = new GameState();
    this.audioManager = new AudioManager();

    this.environment = new Environment(this);
    this.laneSystem = new LaneSystem();
    this.playerController = new PlayerController(this);
    this.trainSystem = new TrainSystem(this);
    this.obstacleSystem = new ObstacleSystem(this);
    this.coinSystem = new CoinSystem(this);
    this.webSystem = new WebSystem(this);

    // Keyboard bindings
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      this.keyF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
      this.keyP = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
      this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    }

    // Touch / click fallback for jump
    this.input.on('pointerdown', () => {
      if (this.gameState.isGameOver) {
        this.restartGame();
      } else {
        this.handleJump();
      }
    });

    this.restartGame();
  }

  public restartGame(): void {
    this.gameState.start();
    this.laneSystem.reset();
    this.playerController.reset();
    this.trainSystem.reset();
    this.obstacleSystem.reset();
    this.coinSystem.reset();
    this.webSystem.reset();
    this.environment.setTargetedPipe(null);
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = 0;

    this.events.emit('gameRestart');
  }

  public togglePause(): boolean {
    if (this.gameState.isGameOver) return false;
    const isPaused = this.gameState.togglePause();
    if (isPaused) {
      this.audioManager.playPauseSound();
      this.events.emit('gamePaused');
    } else {
      this.audioManager.playResumeSound();
      this.events.emit('gameResumed');
    }
    return isPaused;
  }

  public pauseGame(): void {
    if (this.gameState.isGameOver || this.gameState.isPaused) return;
    this.gameState.pause();
    this.audioManager.playPauseSound();
    this.events.emit('gamePaused');
  }

  public resumeGame(): void {
    if (!this.gameState.isPaused) return;
    this.gameState.resume();
    this.audioManager.playResumeSound();
    this.events.emit('gameResumed');
  }

  public returnToMainMenu(): void {
    this.gameState.pause();
    this.events.emit('returnToMainMenu');
  }

  public setControlMode(mode: 'camera' | 'keyboard'): void {
    this.gameState.setControlMode(mode);
    this.events.emit('controlModeChanged', mode);
  }

  public handleJump(): void {
    if (this.gameState.isPaused) return;
    if (this.gameState.isGameOver) {
      this.restartGame();
      return;
    }

    const jumped = this.playerController.jump();
    if (jumped) {
      this.audioManager.playJumpSound();
    }
  }

  /**
   * Called by PoseController when body lean changes lane
   */
  public setMotionLane(lane: -1 | 0 | 1): void {
    if (this.gameState.isGameOver) return;
    this.laneSystem.setLane(lane);
  }

  /**
   * Called by PoseController when a physical jump is detected
   */
  public triggerMotionJump(): void {
    this.handleJump();
  }

  /**
   * Called by GestureController when 🤟 or 🤘 is detected, or keyboard 'E'/'F'
   */
  public triggerWebShoot(): void {
    if (this.gameState.isGameOver) return;
    if (!this.webSystem.isReady()) return;

    const pState = this.playerController.getState();
    if (
      pState === PlayerState.WEB_SHOOTING ||
      pState === PlayerState.WEB_ATTACHED ||
      pState === PlayerState.SWINGING
    ) {
      return;
    }

    // 1. Query nearest overhead metal pipe ahead
    const targetPipeZ = this.environment.getNearestPipeAhead(Perspective3D.PLAYER_Z, 50, 440);

    if (targetPipeZ === null) {
      // No pipe within reachable range: do not trap player, do not create broken web
      this.events.emit('webNotice', 'NO OVERHEAD PIPE IN REACH');
      return;
    }

    const currentLane = this.laneSystem.getTargetLane();

    // 2. Check if an oncoming train will intercept the landing area at swing completion
    const trainAtLanding = this.trainSystem.getTrainInterceptingLanding(
      currentLane,
      this.webSystem.SWING_DURATION,
      this.gameState.currentSpeed
    ) || this.trainSystem.getTrainUnderPosition(currentLane, Perspective3D.PLAYER_Z);

    const willLandOnTrain = !!trainAtLanding;
    const trainRoofHeight = trainAtLanding ? trainAtLanding.height : 85;

    // 3. Highlight targeted pipe in environment
    this.environment.setTargetedPipe(targetPipeZ, false, currentLane);

    // 4. Trigger Web Cycle
    const currentElev = this.playerController.getElevation();
    const started = this.webSystem.triggerWebCycle(
      targetPipeZ,
      currentLane,
      currentElev,
      willLandOnTrain,
      trainRoofHeight
    );

    if (started) {
      this.playerController.setState(PlayerState.WEB_SHOOTING);
      if (willLandOnTrain && trainAtLanding) {
        this.playerController.setCurrentTrainId(trainAtLanding.id);
      }
      this.audioManager.playWebSound();
      this.events.emit('webNotice', willLandOnTrain ? 'SWINGING TO TRAIN! 🚇' : 'SWINGING! 🕸️');
    }
  }

  private lastRumbleTime: number = 0;

  public override update(_time: number, delta: number): void {
    const deltaSec = Math.min(delta / 1000, 0.1);

    // Process keyboard inputs (can toggle pause)
    this.handleKeyboardInputs();

    // If game is paused, freeze world and player animation
    if (this.gameState.isPaused) {
      return;
    }

    if (this.gameState.isGameOver) {
      this.playerController.update(deltaSec, this.laneSystem.getCurrentWorldX(), 0);
      return;
    }

    // Subtle athletic camera response (soft tilt on lane shift & gentle lift on jump/swing)
    const targetCamX = (this.laneSystem.getCurrentWorldX() / Perspective3D.LANE_WIDTH) * 5;
    const targetCamY = -Math.min(14, this.playerController.getElevation() * 0.10);
    this.cameras.main.scrollX += (targetCamX - this.cameras.main.scrollX) * 0.12;
    this.cameras.main.scrollY += (targetCamY - this.cameras.main.scrollY) * 0.12;

    // 1. Update Game State progression (score, distance, speed)
    this.gameState.update(deltaSec);
    const currentSpeed = this.gameState.currentSpeed;

    // 2. Update Environment (tracks, ties, overhead pipes, speed streaks)
    this.environment.update(currentSpeed, deltaSec);

    // 3. Update Lateral Lane Movement (dynamic switch speed scales with forward momentum)
    this.laneSystem.update(deltaSec, currentSpeed);
    const worldX = this.laneSystem.getCurrentWorldX();

    // 4. Update Trains
    this.trainSystem.update(currentSpeed, deltaSec);

    // Close-pass cinematic rumble when a massive train rushes past in adjacent lane
    const now = performance.now();
    if (now > this.lastRumbleTime) {
      for (const train of this.trainSystem.getTrains()) {
        if (train.lane !== this.laneSystem.getTargetLane()) {
          if (Math.abs(train.frontZ - Perspective3D.PLAYER_Z) < 30) {
            this.lastRumbleTime = now + 450;
            this.cameras.main.shake(90, 0.002);
            break;
          }
        }
      }
    }

    // Identify occupied lanes at horizon so obstacles don't overlap
    const occupiedLanes = new Set<-1 | 0 | 1>(
      this.trainSystem.getTrains()
        .filter(t => t.frontZ > 950)
        .map(t => t.lane)
    );

    // 5. Update Obstacles
    this.obstacleSystem.update(currentSpeed, deltaSec, occupiedLanes);

    // 6. Update Coins
    this.coinSystem.update(currentSpeed, deltaSec, this.trainSystem.getTrains());

    // 7. Update Web System
    const isWebCycleActive = this.webSystem.getWebState() !== 'WEB_READY';
    if (isWebCycleActive) {
      const handPos = this.playerController.getHandScreenPos();
      const webResult = this.webSystem.update(deltaSec, handPos, currentSpeed);

      this.playerController.setState(webResult.playerState);
      this.playerController.setElevation(webResult.elevation);

      if (webResult.justAttached) {
        this.environment.setTargetedPipe(null, true, this.laneSystem.getTargetLane());
      }

      if (webResult.justLanded) {
        this.environment.setTargetedPipe(null);
        if (webResult.landedOnTrain) {
          const train = this.playerController.getCurrentTrainId() !== null
            ? this.trainSystem.getTrainById(this.playerController.getCurrentTrainId()!)
            : this.trainSystem.getTrainUnderPosition(this.laneSystem.getTargetLane(), Perspective3D.PLAYER_Z);
          this.playerController.setTrainRoofState(85, train?.id);
        } else {
          this.playerController.setState(PlayerState.ON_TRACK);
          this.playerController.setElevation(0);
          this.playerController.setCurrentTrainId(null);
          this.playerController.triggerLanding();
        }
        this.audioManager.playLandSound();
      }
    } else {
      this.environment.setTargetedPipe(null);
    }

    // 8. Update Player Controller & Physics
    this.playerController.update(deltaSec, worldX, currentSpeed);

    // 9. Automatic Train -> Track Return Check (Requirements 9 & 10)
    // When the character reaches the actual end of ANY train, naturally leave roof and return to track
    if (this.playerController.getState() === PlayerState.ON_TRAIN) {
      const currentTrainId = this.playerController.getCurrentTrainId();
      if (currentTrainId !== null) {
        const stillOnTrain = this.trainSystem.isPlayerStillOnTrainRoof(currentTrainId, Perspective3D.PLAYER_Z);
        if (!stillOnTrain) {
          this.playerController.leaveTrainRoof();
        }
      } else {
        const trainBelow = this.trainSystem.getTrainUnderPosition(this.laneSystem.getTargetLane(), Perspective3D.PLAYER_Z);
        if (!trainBelow) {
          this.playerController.leaveTrainRoof();
        } else {
          this.playerController.setCurrentTrainId(trainBelow.id);
        }
      }
    }

    // 10. Collision Checks
    const playerElevation = this.playerController.getElevation();
    const isPlayerSwinging =
      this.playerController.getState() === PlayerState.SWINGING ||
      this.playerController.getState() === PlayerState.WEB_SHOOTING ||
      this.playerController.getState() === PlayerState.WEB_ATTACHED;

    // Train interaction
    if (!isPlayerSwinging) {
      const trainCheck = this.trainSystem.checkPlayerInteraction(worldX, playerElevation);
      if (trainCheck.status === 'CRASH') {
        this.handleGameOver();
        return;
      } else if (trainCheck.status === 'ROOF' && trainCheck.train) {
        this.playerController.setTrainRoofState(trainCheck.train.height, trainCheck.train.id);
      }
    }

    // Obstacle interaction
    if (!isPlayerSwinging) {
      const hitObstacle = this.obstacleSystem.checkPlayerCollision(worldX, playerElevation);
      if (hitObstacle) {
        this.handleGameOver();
        return;
      }
    }

    // Coin collection (works on track, while swinging, and on train roof!)
    const collected = this.coinSystem.checkCollection(worldX, playerElevation);
    if (collected > 0) {
      this.gameState.addCoin(collected);
      this.audioManager.playCoinSound();
    }

    // 11. Emit HUD update
    this.events.emit(
      'updateScore',
      this.gameState.score,
      this.gameState.coins,
      this.gameState.currentSpeed,
      Math.floor(this.gameState.distance)
    );
  }

  private handleKeyboardInputs(): void {
    if (!this.cursors) return;

    // Pause / Resume with P or ESC
    const isPausePressed =
      (this.keyP && Phaser.Input.Keyboard.JustDown(this.keyP)) ||
      (this.keyEsc && Phaser.Input.Keyboard.JustDown(this.keyEsc));

    if (isPausePressed) {
      this.togglePause();
      return;
    }

    // Freeze controls while paused
    if (this.gameState.isPaused) return;

    // Left
    const isLeft = this.cursors.left.isDown || this.keyA?.isDown;
    if (isLeft && !this.leftDown) {
      this.leftDown = true;
      this.laneSystem.shiftLeft();
    } else if (!isLeft) {
      this.leftDown = false;
    }

    // Right
    const isRight = this.cursors.right.isDown || this.keyD?.isDown;
    if (isRight && !this.rightDown) {
      this.rightDown = true;
      this.laneSystem.shiftRight();
    } else if (!isRight) {
      this.rightDown = false;
    }

    // Jump
    const isJumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      (this.keyW && Phaser.Input.Keyboard.JustDown(this.keyW)) ||
      (this.keySpace && Phaser.Input.Keyboard.JustDown(this.keySpace));

    if (isJumpPressed) {
      this.handleJump();
    }

    // Web Shoot (Testing fallback with 'E' or 'F')
    const isWebPressed =
      (this.keyE && Phaser.Input.Keyboard.JustDown(this.keyE)) ||
      (this.keyF && Phaser.Input.Keyboard.JustDown(this.keyF));

    if (isWebPressed) {
      this.triggerWebShoot();
    }
  }

  private handleGameOver(): void {
    this.gameState.triggerGameOver();
    this.playerController.triggerGameOver();
    this.audioManager.playCrashSound();

    this.events.emit('gameOver', {
      score: this.gameState.score,
      coins: this.gameState.coins,
      distance: Math.floor(this.gameState.distance),
      highScore: this.gameState.highScore,
      controlMode: this.gameState.controlMode
    });
  }

  public getAudioManager(): AudioManager {
    return this.audioManager;
  }
}
