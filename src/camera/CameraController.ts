export class CameraController {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private isRunning: boolean = false;
  private onFrameCallbacks: Array<(video: HTMLVideoElement, timestamp: number) => void> = [];
  private animationFrameId: number | null = null;

  constructor(videoSelector: string = '#webcam-video', canvasSelector: string = '#webcam-canvas') {
    this.videoElement = document.querySelector<HTMLVideoElement>(videoSelector);
    this.canvasElement = document.querySelector<HTMLCanvasElement>(canvasSelector);
  }

  public async start(): Promise<boolean> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('getUserMedia not supported in this environment');
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await new Promise<void>((resolve) => {
          if (!this.videoElement) return resolve();
          this.videoElement.onloadedmetadata = () => {
            this.videoElement!.play().then(() => resolve()).catch(() => resolve());
          };
        });

        if (this.canvasElement) {
          this.canvasElement.width = this.videoElement.videoWidth || 640;
          this.canvasElement.height = this.videoElement.videoHeight || 480;
        }
      }

      this.isRunning = true;
      this.startLoop();
      return true;
    } catch (err) {
      console.warn('Could not acquire webcam stream:', err);
      return false;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  public onFrame(callback: (video: HTMLVideoElement, timestamp: number) => void): void {
    this.onFrameCallbacks.push(callback);
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  public getCanvasElement(): HTMLCanvasElement | null {
    return this.canvasElement;
  }

  public getCanvasContext(): CanvasRenderingContext2D | null {
    return this.canvasElement ? this.canvasElement.getContext('2d') : null;
  }

  public isActive(): boolean {
    return this.isRunning && !!this.stream;
  }

  private startLoop(): void {
    const loop = (timestamp: number) => {
      if (!this.isRunning) return;
      if (this.videoElement && this.videoElement.readyState >= 2) {
        for (const cb of this.onFrameCallbacks) {
          cb(this.videoElement, timestamp);
        }
      }
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }
}
