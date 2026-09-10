import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export type PhysicalJumpState = 'CALIBRATING' | 'GROUNDED' | 'AIRBORNE' | 'LANDED';

export interface PoseFrameData {
  rawX: number;
  smoothedX: number;
  targetLane: -1 | 0 | 1;
  isJumping: boolean;
  shoulderY: number;
  bodyY: number;
  baselineY: number;
  jumpState: PhysicalJumpState;
  calibrationProgress: number;
}

export class PoseController {
  private poseLandmarker: PoseLandmarker | null = null;
  private isModelReady: boolean = false;
  private isProcessing: boolean = false;
  private lastVideoTime: number = -1;
  private lastFrameTimestamp: number = 0;

  // Lateral Movement (Preserved exact behavior & thresholds)
  private smoothedX: number = 0.5;
  private currentLane: -1 | 0 | 1 = 0;
  private readonly LEFT_THRESHOLD = 0.57;   // Mirror-adjusted physical lean left
  private readonly RIGHT_THRESHOLD = 0.43;  // Mirror-adjusted physical lean right

  // Physical Jump Detection Architecture
  private jumpState: PhysicalJumpState = 'CALIBRATING';
  private standingBaselineY: number = 0.6;
  private smoothedBodyY: number = 0.6;
  private previousBodyY: number = 0.6;
  private verticalVelocity: number = 0; // Normalized units / second

  // Calibration Settings
  private calibrationSamples: number[] = [];
  private readonly CALIBRATION_FRAMES_REQUIRED = 35; // ~1.2s of standing steady
  private isCalibrated: boolean = false;

  // Physical Jump Thresholds & Debounce
  // In camera coords: y=0 is top, y=1 is bottom. Jumping up decreases bodyY.
  private readonly JUMP_UPWARD_DELTA = 0.042;     // Upward displacement from standing baseline (4.2% of frame)
  private readonly JUMP_VELOCITY_MIN = -0.09;     // Minimum upward velocity to filter out slow posture changes
  private readonly LANDING_TOLERANCE = 0.022;     // How close to baseline to be considered landed (2.2%)
  private readonly JUMP_COOLDOWN_MS = 500;        // Minimum time between physical jumps
  private readonly LANDED_DEBOUNCE_MS = 250;      // Debounce period after landing before re-arming

  private lastJumpTimestamp: number = 0;
  private landedTimestamp: number = 0;

  // Event callbacks
  private onLaneChangeCallback?: (lane: -1 | 0 | 1) => void;
  private onJumpCallback?: () => void;
  private onPoseDetectedCallback?: (data: PoseFrameData) => void;
  private onJumpStateChangeCallback?: (state: PhysicalJumpState) => void;

  public async init(): Promise<boolean> {
    try {
      console.log('Initializing MediaPipe PoseLandmarker for Physical Jump...');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );

      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.isModelReady = true;
      this.resetCalibration();
      console.log('MediaPipe PoseLandmarker initialized successfully!');
      return true;
    } catch (err) {
      console.warn('Failed to initialize MediaPipe PoseLandmarker. Falling back to keyboard:', err);
      this.isModelReady = false;
      return false;
    }
  }

  public resetCalibration(): void {
    this.calibrationSamples = [];
    this.isCalibrated = false;
    this.jumpState = 'CALIBRATING';
    this.onJumpStateChangeCallback?.('CALIBRATING');
  }

  public processVideoFrame(
    video: HTMLVideoElement,
    canvasCtx: CanvasRenderingContext2D | null,
    timestamp: number
  ): void {
    if (!this.isModelReady || !this.poseLandmarker || this.isProcessing) return;
    if (video.currentTime === this.lastVideoTime) return;

    const deltaSec = this.lastFrameTimestamp > 0
      ? Math.min((timestamp - this.lastFrameTimestamp) / 1000, 0.1)
      : 0.033;
    this.lastFrameTimestamp = timestamp;
    this.lastVideoTime = video.currentTime;
    this.isProcessing = true;

    try {
      const results = this.poseLandmarker.detectForVideo(video, timestamp);

      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvasCtx.canvas.width, canvasCtx.canvas.height);
      }

      if (results && results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];

        // Key landmarks:
        // 11: left_shoulder, 12: right_shoulder
        // 23: left_hip, 24: right_hip
        // 25: left_knee, 26: right_knee
        // 27: left_ankle, 28: right_ankle
        // 31: left_foot_index, 32: right_foot_index
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        const leftAnkle = landmarks[27];
        const rightAnkle = landmarks[28];

        if (leftShoulder && rightShoulder) {
          // ==========================================
          // 1. LATERAL BODY LEAN (LANE MOVEMENT)
          // Preserved exact original logic and thresholds
          // ==========================================
          const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
          this.smoothedX = this.smoothedX * 0.75 + shoulderMidX * 0.25;

          let detectedLane: -1 | 0 | 1 = 0;
          if (this.smoothedX > this.LEFT_THRESHOLD) {
            detectedLane = -1; // Left Lane
          } else if (this.smoothedX < this.RIGHT_THRESHOLD) {
            detectedLane = 1;  // Right Lane
          } else {
            detectedLane = 0;  // Center Lane
          }

          if (detectedLane !== this.currentLane) {
            this.currentLane = detectedLane;
            this.onLaneChangeCallback?.(detectedLane);
          }

          // ==========================================
          // 2. COMPOSITE BODY VERTICAL TRACKING
          // Uses hips, knees, ankles, feet, and shoulders
          // ==========================================
          const currentCompositeY = this.computeCompositeBodyY(
            leftShoulder, rightShoulder,
            leftHip, rightHip,
            leftKnee, rightKnee,
            leftAnkle, rightAnkle
          );

          // Apply exponential smoothing to eliminate high-frequency webcam noise
          this.previousBodyY = this.smoothedBodyY;
          this.smoothedBodyY = this.smoothedBodyY * 0.65 + currentCompositeY * 0.35;

          // Compute instantaneous vertical velocity (negative = moving upward)
          if (deltaSec > 0) {
            const rawVelocity = (this.smoothedBodyY - this.previousBodyY) / deltaSec;
            this.verticalVelocity = this.verticalVelocity * 0.6 + rawVelocity * 0.4;
          }

          // ==========================================
          // 3. CALIBRATION & PHYSICAL JUMP STATE MACHINE
          // ==========================================
          const now = performance.now();
          let isJumpingThisFrame = false;

          if (!this.isCalibrated) {
            this.handleCalibration(this.smoothedBodyY);
          } else {
            isJumpingThisFrame = this.updateJumpStateMachine(now);
          }

          // ==========================================
          // 4. DRAW SKELETON & VISUAL CALIBRATION GAUGES
          // ==========================================
          if (canvasCtx) {
            this.drawFullSkeleton(
              canvasCtx,
              landmarks,
              detectedLane,
              this.jumpState === 'AIRBORNE',
              this.smoothedBodyY,
              this.standingBaselineY
            );
          }

          const calProgress = Math.min(1, this.calibrationSamples.length / this.CALIBRATION_FRAMES_REQUIRED);

          this.onPoseDetectedCallback?.({
            rawX: shoulderMidX,
            smoothedX: this.smoothedX,
            targetLane: detectedLane,
            isJumping: isJumpingThisFrame,
            shoulderY: (leftShoulder.y + rightShoulder.y) / 2,
            bodyY: this.smoothedBodyY,
            baselineY: this.standingBaselineY,
            jumpState: this.jumpState,
            calibrationProgress: calProgress
          });
        }
      }
    } catch (err) {
      console.warn('Error during pose detection:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Computes a weighted, confidence-checked body elevation metric.
   * Prioritizes hips (center of mass), supplemented by knees, ankles, and shoulders.
   */
  private computeCompositeBodyY(
    lShoulder: any, rShoulder: any,
    lHip: any, rHip: any,
    lKnee: any, rKnee: any,
    lAnkle: any, rAnkle: any
  ): number {
    let totalWeight = 0;
    let weightedY = 0;

    // 1. Shoulders (weight: 0.30)
    if (lShoulder && rShoulder) {
      const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
      const shoulderVis = Math.min(lShoulder.visibility ?? 1, rShoulder.visibility ?? 1);
      if (shoulderVis > 0.4) {
        weightedY += shoulderMidY * 0.30;
        totalWeight += 0.30;
      }
    }

    // 2. Hips (Primary Center of Mass, weight: 0.50)
    if (lHip && rHip) {
      const hipMidY = (lHip.y + rHip.y) / 2;
      const hipVis = Math.min(lHip.visibility ?? 1, rHip.visibility ?? 1);
      if (hipVis > 0.4) {
        weightedY += hipMidY * 0.50;
        totalWeight += 0.50;
      }
    }

    // 3. Knees (weight: 0.15 if visible)
    if (lKnee && rKnee) {
      const kneeMidY = (lKnee.y + rKnee.y) / 2;
      const kneeVis = Math.min(lKnee.visibility ?? 1, rKnee.visibility ?? 1);
      if (kneeVis > 0.4) {
        weightedY += kneeMidY * 0.15;
        totalWeight += 0.15;
      }
    }

    // 4. Ankles (weight: 0.05 if visible)
    if (lAnkle && rAnkle) {
      const ankleMidY = (lAnkle.y + rAnkle.y) / 2;
      const ankleVis = Math.min(lAnkle.visibility ?? 1, rAnkle.visibility ?? 1);
      if (ankleVis > 0.4) {
        weightedY += ankleMidY * 0.05;
        totalWeight += 0.05;
      }
    }

    return totalWeight > 0 ? weightedY / totalWeight : (lShoulder.y + rShoulder.y) / 2;
  }

  /**
   * Samples standing posture to establish a reliable physical standing baseline.
   */
  private handleCalibration(currentY: number): void {
    this.calibrationSamples.push(currentY);

    if (this.calibrationSamples.length >= this.CALIBRATION_FRAMES_REQUIRED) {
      // Sort and take median to reject any sudden outliers
      const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
      const medianY = sorted[Math.floor(sorted.length / 2)];

      this.standingBaselineY = medianY;
      this.smoothedBodyY = medianY;
      this.isCalibrated = true;
      this.setJumpState('GROUNDED');
      console.log(`Standing baseline established at Y = ${this.standingBaselineY.toFixed(3)}`);
    }
  }

  /**
   * Deterministic State Machine for Physical Jumping.
   * Enforces: Exactly ONE character jump per physical jump, preventing repeated triggers while airborne.
   */
  private updateJumpStateMachine(now: number): boolean {
    // Upward displacement from baseline (positive when jumping UP)
    const upwardDisplacement = this.standingBaselineY - this.smoothedBodyY;

    switch (this.jumpState) {
      case 'GROUNDED': {
        // Slow adaptive baseline drift while at rest (accounts for subtle shifts in posture)
        if (Math.abs(upwardDisplacement) < 0.02 && Math.abs(this.verticalVelocity) < 0.04) {
          this.standingBaselineY = this.standingBaselineY * 0.995 + this.smoothedBodyY * 0.005;
        }

        // Trigger condition:
        // 1. Meaningful upward displacement >= JUMP_UPWARD_DELTA
        // 2. Active upward velocity <= JUMP_VELOCITY_MIN
        // 3. Cooldown elapsed
        if (
          upwardDisplacement >= this.JUMP_UPWARD_DELTA &&
          this.verticalVelocity <= this.JUMP_VELOCITY_MIN &&
          now - this.lastJumpTimestamp > this.JUMP_COOLDOWN_MS
        ) {
          this.lastJumpTimestamp = now;
          this.setJumpState('AIRBORNE');

          // Trigger EXACTLY ONE character jump
          this.onJumpCallback?.();
          return true;
        }
        break;
      }

      case 'AIRBORNE': {
        // While airborne, NO repeated jumps are allowed under any circumstances.
        // Wait until player physically descends back near the standing baseline.
        const isBackNearGround = upwardDisplacement <= this.LANDING_TOLERANCE;
        const isMovingDownOrSettled = this.verticalVelocity >= -0.02;

        if (isBackNearGround && isMovingDownOrSettled) {
          this.landedTimestamp = now;
          this.setJumpState('LANDED');
        }
        break;
      }

      case 'LANDED': {
        // Debounce period: allow player to absorb landing impact without false triggers
        if (now - this.landedTimestamp > this.LANDED_DEBOUNCE_MS) {
          this.setJumpState('GROUNDED');
        }
        break;
      }

      case 'CALIBRATING':
      default:
        break;
    }

    return false;
  }

  private setJumpState(newState: PhysicalJumpState): void {
    if (this.jumpState !== newState) {
      this.jumpState = newState;
      this.onJumpStateChangeCallback?.(newState);
    }
  }

  /**
   * Draws full body skeleton (including hips, knees, ankles, feet)
   * and visual jump threshold indicators on the PiP canvas.
   */
  private drawFullSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    lane: -1 | 0 | 1,
    isAirborne: boolean,
    currentBodyY: number,
    baselineY: number
  ): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Full body connections
    const connections = [
      // Arms & Shoulders
      [11, 12], // shoulder bridge
      [11, 13], [13, 15], // left arm
      [12, 14], [14, 16], // right arm
      // Torso
      [11, 23], [12, 24], // sides
      [23, 24], // hip bridge
      // Legs (hips -> knees -> ankles -> feet)
      [23, 25], [25, 27], [27, 29], [29, 31], // left leg & foot
      [24, 26], [26, 28], [28, 30], [30, 32], // right leg & foot
    ];

    ctx.save();

    // 1. Draw Visual Baseline and Jump Threshold Guideline
    if (this.isCalibrated) {
      const baseYScreen = baselineY * h;
      const threshYScreen = (baselineY - this.JUMP_UPWARD_DELTA) * h;

      // Standing Baseline (Green dashed)
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.moveTo(8, baseYScreen);
      ctx.lineTo(w - 8, baseYScreen);
      ctx.stroke();

      // Jump Threshold (Golden/Cyan dashed)
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = isAirborne ? 'rgba(255, 183, 3, 0.9)' : 'rgba(0, 240, 255, 0.7)';
      ctx.moveTo(8, threshYScreen);
      ctx.lineTo(w - 8, threshYScreen);
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // Height Elevation Bar Indicator on left edge
      const barX = 6;
      const barTop = threshYScreen;
      const barBottom = baseYScreen;
      ctx.fillStyle = isAirborne ? '#ffb703' : '#00f0ff';
      ctx.fillRect(barX - 2, currentBodyY * h - 3, 6, 6);
    }

    // 2. Draw Skeleton Bones
    ctx.lineWidth = 3;
    ctx.strokeStyle = isAirborne
      ? '#ffb703'
      : lane === 0
      ? '#00f0ff'
      : '#e63946';

    for (const [i, j] of connections) {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      if (p1 && p2 && (p1.visibility ?? 1) > 0.35 && (p2.visibility ?? 1) > 0.35) {
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
      }
    }

    // 3. Draw Joints (head, shoulders, elbows, wrists, hips, knees, ankles, feet)
    const trackedJoints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
    for (const idx of trackedJoints) {
      const p = landmarks[idx];
      if (p && (p.visibility ?? 1) > 0.35) {
        const isHipOrKnee = idx === 23 || idx === 24 || idx === 25 || idx === 26;
        const radius = idx === 0 ? 6 : isHipOrKnee ? 5 : 3.5;

        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, radius, 0, 2 * Math.PI);
        ctx.fillStyle = isAirborne
          ? '#ffb703'
          : isHipOrKnee
          ? '#10b981'
          : idx === 0
          ? '#e63946'
          : '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  public onLaneChange(cb: (lane: -1 | 0 | 1) => void): void {
    this.onLaneChangeCallback = cb;
  }

  public onJump(cb: () => void): void {
    this.onJumpCallback = cb;
  }

  public onJumpStateChange(cb: (state: PhysicalJumpState) => void): void {
    this.onJumpStateChangeCallback = cb;
  }

  public onPoseData(cb: (data: PoseFrameData) => void): void {
    this.onPoseDetectedCallback = cb;
  }

  public isReady(): boolean {
    return this.isModelReady;
  }

  public getJumpState(): PhysicalJumpState {
    return this.jumpState;
  }
}
