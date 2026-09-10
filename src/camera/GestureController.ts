import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type GestureState =
  | 'INITIALIZING'
  | 'HAND_OFFSCREEN'
  | 'HAND_READY'
  | 'GESTURE_CONFIRMING'
  | 'GESTURE_TRIGGERED'
  | 'GESTURE_HELD_LOCKED'
  | 'GESTURE_COOLDOWN';

export class GestureController {
  private handLandmarker: HandLandmarker | null = null;
  private isModelReady: boolean = false;
  private isProcessing: boolean = false;
  private lastVideoTime: number = -1;

  // Gesture State Tracking
  private gestureState: GestureState = 'INITIALIZING';
  private consecutiveGestureFrames: number = 0;
  private readonly FRAMES_TO_CONFIRM = 2; // Ultra-snappy confirmation ~50-60ms
  private lastTriggerTimestamp: number = 0;
  private releaseTimestamp: number = 0;
  private readonly COOLDOWN_MS = 320; // Fast recharge after gesture release

  // Event callbacks
  private onWebShootCallback?: () => void;
  private onStateChangeCallback?: (state: GestureState, description: string) => void;

  public async init(): Promise<boolean> {
    try {
      console.log('Initializing MediaPipe HandLandmarker for Spider-Web Gestures...');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.isModelReady = true;
      this.setGestureState('HAND_OFFSCREEN', 'HAND READY (Bring hand into view)');
      console.log('MediaPipe HandLandmarker initialized successfully!');
      return true;
    } catch (err) {
      console.warn('Could not initialize HandLandmarker. Fallback to Pose wrist/keyboard:', err);
      this.isModelReady = false;
      return false;
    }
  }

  public processVideoFrame(
    video: HTMLVideoElement,
    canvasCtx: CanvasRenderingContext2D | null,
    timestamp: number
  ): void {
    if (!this.isModelReady || !this.handLandmarker || this.isProcessing) return;
    if (video.currentTime === this.lastVideoTime) return;

    this.lastVideoTime = video.currentTime;
    this.isProcessing = true;

    try {
      const results = this.handLandmarker.detectForVideo(video, timestamp);
      const now = performance.now();

      if (results && results.landmarks && results.landmarks.length > 0) {
        const hand = results.landmarks[0];

        // Draw hand skeleton over PiP canvas
        if (canvasCtx) {
          this.drawHandSkeleton(canvasCtx, hand);
        }

        // Check for 🤟 or 🤘 gesture
        const isSpiderGesture = this.checkSpiderGesture(hand);

        this.updateGestureStateMachine(isSpiderGesture, now);
      } else {
        // No hand in view
        if (this.gestureState !== 'HAND_OFFSCREEN' && this.gestureState !== 'INITIALIZING') {
          this.setGestureState('HAND_OFFSCREEN', 'NO HAND DETECTED');
        }
        this.consecutiveGestureFrames = 0;
      }
    } catch (err) {
      console.warn('Error detecting hand gesture:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Evaluates if hand matches 🤟 or 🤘:
   * - Index finger: EXTENDED
   * - Pinky finger: EXTENDED
   * - Middle finger: FOLDED / CURLED
   * - Ring finger: FOLDED / CURLED
   * - Thumb: Either extended (🤟) or curled over middle/ring (🤘)
   */
  private checkSpiderGesture(landmarks: any[]): boolean {
    if (!landmarks || landmarks.length < 21) return false;

    const wrist = landmarks[0];

    const dist = (p1: any, p2: any) => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dz = (p1.z || 0) - (p2.z || 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    // Index finger (5: MCP, 6: PIP, 8: TIP)
    const indexTipDist = dist(landmarks[8], wrist);
    const indexPipDist = dist(landmarks[6], wrist);
    const isIndexExtended = indexTipDist > indexPipDist * 1.25;

    // Pinky finger (17: MCP, 18: PIP, 20: TIP)
    const pinkyTipDist = dist(landmarks[20], wrist);
    const pinkyPipDist = dist(landmarks[18], wrist);
    const isPinkyExtended = pinkyTipDist > pinkyPipDist * 1.25;

    // Middle finger (9: MCP, 10: PIP, 12: TIP)
    const middleTipDist = dist(landmarks[12], wrist);
    const middlePipDist = dist(landmarks[10], wrist);
    const isMiddleFolded = middleTipDist < middlePipDist * 1.15;

    // Ring finger (13: MCP, 14: PIP, 16: TIP)
    const ringTipDist = dist(landmarks[16], wrist);
    const ringPipDist = dist(landmarks[14], wrist);
    const isRingFolded = ringTipDist < ringPipDist * 1.15;

    // Both 🤟 (ILY) and 🤘 (Rock on) require Index + Pinky out, Middle + Ring curled!
    return isIndexExtended && isPinkyExtended && isMiddleFolded && isRingFolded;
  }

  /**
   * Deterministic State Machine for Gesture Activation:
   * - Requires holding gesture briefly (3 consecutive frames)
   * - Exactly ONE activation per gesture
   * - Holding the gesture does NOT retrigger
   * - Must release gesture + cooldown before re-arming
   */
  private updateGestureStateMachine(isGestureActive: boolean, now: number): void {
    switch (this.gestureState) {
      case 'HAND_OFFSCREEN':
      case 'HAND_READY': {
        this.setGestureState('HAND_READY', 'HAND READY 🤟');

        if (isGestureActive) {
          this.consecutiveGestureFrames++;
          if (this.consecutiveGestureFrames >= this.FRAMES_TO_CONFIRM) {
            // FIRE EXACTLY ONE WEB!
            this.lastTriggerTimestamp = now;
            this.setGestureState('GESTURE_HELD_LOCKED', 'WEB FIRED! 🕸️');
            this.onWebShootCallback?.();
            this.consecutiveGestureFrames = 0;
          }
        } else {
          this.consecutiveGestureFrames = 0;
        }
        break;
      }

      case 'GESTURE_HELD_LOCKED': {
        // Player is holding 🤟 or 🤘.
        // DO NOT repeatedly fire webs!
        if (!isGestureActive) {
          // Player released the gesture
          this.releaseTimestamp = now;
          this.setGestureState('GESTURE_COOLDOWN', 'GESTURE RELEASED');
        }
        break;
      }

      case 'GESTURE_COOLDOWN': {
        // Debounce before re-arming
        if (now - this.releaseTimestamp > this.COOLDOWN_MS) {
          this.setGestureState('HAND_READY', 'HAND READY 🤟');
        }
        break;
      }

      default:
        break;
    }
  }

  private setGestureState(state: GestureState, description: string): void {
    if (this.gestureState !== state) {
      this.gestureState = state;
      this.onStateChangeCallback?.(state, description);
    }
  }

  private drawHandSkeleton(ctx: CanvasRenderingContext2D, landmarks: any[]): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Hand connections
    const fingers = [
      [0, 1, 2, 3, 4],       // Thumb
      [0, 5, 6, 7, 8],       // Index
      [0, 9, 10, 11, 12],    // Middle
      [0, 13, 14, 15, 16],   // Ring
      [0, 17, 18, 19, 20],   // Pinky
      [5, 9, 13, 17, 0]      // Palm base
    ];

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.gestureState === 'GESTURE_HELD_LOCKED' ? '#ffb703' : '#00f0ff';

    for (const chain of fingers) {
      ctx.beginPath();
      for (let i = 0; i < chain.length; i++) {
        const p = landmarks[chain[i]];
        if (i === 0) {
          ctx.moveTo(p.x * w, p.y * h);
        } else {
          ctx.lineTo(p.x * w, p.y * h);
        }
      }
      ctx.stroke();
    }

    // Draw fingertip markers
    const isSpiderGesture = this.gestureState === 'GESTURE_HELD_LOCKED';
    for (const idx of [4, 8, 12, 16, 20]) {
      const p = landmarks[idx];
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = isSpiderGesture ? '#e63946' : '#ffffff';
      ctx.fill();
    }

    ctx.restore();
  }

  public onWebShoot(cb: () => void): void {
    this.onWebShootCallback = cb;
  }

  public onStateChange(cb: (state: GestureState, desc: string) => void): void {
    this.onStateChangeCallback = cb;
  }

  public isReady(): boolean {
    return this.isModelReady;
  }

  public getGestureState(): GestureState {
    return this.gestureState;
  }
}
