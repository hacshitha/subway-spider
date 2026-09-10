export interface ScreenPoint {
  x: number;
  y: number;
  scale: number;
  depth: number;
}

export class Perspective3D {
  public static readonly VIEW_WIDTH = 800;
  public static readonly VIEW_HEIGHT = 600;

  // Vanishing point on screen
  public static readonly VANISHING_X = 400;
  public static readonly VANISHING_Y = 210;

  // Ground distance below horizon in foreground
  public static readonly GROUND_DEPTH_FACTOR = 480;

  // Perspective focal length
  public static readonly FOCAL_LENGTH = 190;

  // Max visual distance
  public static readonly MAX_Z = 1100;
  public static readonly PLAYER_Z = 130;

  // Lane world positions
  public static readonly LANE_WIDTH = 130;

  public static getLaneWorldX(lane: -1 | 0 | 1 | number): number {
    return lane * this.LANE_WIDTH;
  }

  /**
   * Projects a 3D world coordinate (x, y, z) into 2.5D screen coordinates.
   * x: horizontal offset from center (0 = center lane, -130 = left, +130 = right)
   * y: elevation above ground (0 = ground, 90 = train roof)
   * z: distance ahead (0 = screen camera plane, 130 = player plane, 1000 = horizon)
   */
  public static project(x: number, y: number, z: number): ScreenPoint {
    const clampedZ = Math.max(10, z);
    const scale = this.FOCAL_LENGTH / (this.FOCAL_LENGTH + clampedZ);

    const screenX = this.VANISHING_X + x * scale;
    const screenY = this.VANISHING_Y + (this.GROUND_DEPTH_FACTOR - y) * scale;

    return {
      x: screenX,
      y: screenY,
      scale: scale,
      depth: clampedZ
    };
  }
}
