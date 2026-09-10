import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Generates the official PNG sprite sheet asset for SUBWAY SPIDER:
 * public/assets/player_spritesheet.png
 * 
 * CAMERA PERSPECTIVE: 3/4 BACK / REAR VIEW
 * - The character is viewed from BEHIND running FORWARD away from the camera down the subway tracks.
 * - Masked Spider head faces forward down the track with web pattern across the rear cowl.
 * - Broad athletic back showing the Subway Spider cream jacket with light-blue denim shoulder yoke, hood, and sleeves.
 * - Muscular athletic legs with true running gait: foot plant, knee drive, toe push-off, and flight phases.
 * - When kicking back, the black tread & white sole of the sneakers face the camera!
 * 
 * Layout:
 * - 640 x 800 pixels
 * - 4 columns x 4 rows (16 frames)
 * - Frame width: 160 px, Frame height: 200 px
 * - Origin: (80, 188) (bottom center where feet contact the running surface)
 */

const FRAME_WIDTH = 160;
const FRAME_HEIGHT = 200;
const COLS = 4;
const ROWS = 4;
const ATLAS_WIDTH = FRAME_WIDTH * COLS;   // 640
const ATLAS_HEIGHT = FRAME_HEIGHT * ROWS; // 800

// Standard CRC32 implementation for PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const scanlineLen = 1 + width * 4;
  const scanlines = Buffer.alloc(height * scanlineLen);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLen;
    scanlines[rowOffset] = 0; // filter type 0
    rgbaBuffer.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const deflated = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Pixel buffer helper
class CanvasBuffer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.buffer = Buffer.alloc(width * height * 4); // all transparent
  }

  setPixel(x, y, r, g, b, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    const srcA = a / 255;
    const dstA = this.buffer[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return;

    this.buffer[idx] = Math.round((r * srcA + this.buffer[idx] * dstA * (1 - srcA)) / outA);
    this.buffer[idx + 1] = Math.round((g * srcA + this.buffer[idx + 1] * dstA * (1 - srcA)) / outA);
    this.buffer[idx + 2] = Math.round((b * srcA + this.buffer[idx + 2] * dstA * (1 - srcA)) / outA);
    this.buffer[idx + 3] = Math.round(outA * 255);
  }

  fillCircle(cx, cy, radius, color) {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));
    const [r, g, b, a = 255] = color;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 <= r2) {
          const edgeDist = radius - Math.sqrt(d2);
          const edgeAlpha = Math.min(1, Math.max(0, edgeDist * 1.5)) * a;
          this.setPixel(x, y, r, g, b, edgeAlpha);
        }
      }
    }
  }

  fillCapsule(x0, y0, x1, y1, radius, color) {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius - 1));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(x0, x1) + radius + 1));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius - 1));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(y0, y1) + radius + 1));
    const r2 = radius * radius;
    const [r, g, b, a = 255] = color;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let t = 0;
        if (lenSq > 0) {
          t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / lenSq));
        }
        const projX = x0 + t * dx;
        const projY = y0 + t * dy;
        const d2 = (x - projX) * (x - projX) + (y - projY) * (y - projY);
        if (d2 <= r2) {
          const edgeDist = radius - Math.sqrt(d2);
          const edgeAlpha = Math.min(1, Math.max(0, edgeDist * 1.4)) * a;
          this.setPixel(x, y, r, g, b, edgeAlpha);
        }
      }
    }
  }
}

// Authentic Superhero Color Palette
const C_RED = [225, 29, 72];         // Crimson superhero red (#e11d48)
const C_RED_SHADOW = [159, 18, 57];  // Shadow red (#9f1239)
const C_RED_FAR = [120, 15, 45];     // Far leg/arm depth shadow
const C_CREAM = [248, 250, 252];     // Cream/off-white jacket (#f8fafc)
const C_CREAM_SHADOW = [226, 232, 240];
const C_CREAM_FAR = [203, 213, 225];
const C_BLUE_YOKE = [2, 132, 199];   // Denim shoulder yoke (#0284c7)
const C_BLUE_STRIPE = [56, 189, 248];// Light blue racing stripe (#38bdf8)
const C_NAVY = [30, 58, 138];        // Athletic tights (#1e3a8a)
const C_NAVY_FAR = [10, 15, 29];     // Deep shadow far leg (#0a0f1d)
const C_WHITE = [255, 255, 255];
const C_WHITE_FAR = [148, 163, 184];
const C_OUTLINE = [7, 11, 20];       // Crisp dark arcade contour
const C_CYAN = [0, 240, 255];        // Web spark
const C_TREAD = [15, 23, 42];        // Sneaker rubber outsole tread

const canvas = new CanvasBuffer(ATLAS_WIDTH, ATLAS_HEIGHT);

/**
 * Draws a complete full-body superhero frame in 3/4 REAR PERSPECTIVE
 */
function drawRearSuperheroFrame(frameIndex, ox, oy) {
  let leftThighA = 0, leftKneeA = 0, leftFootIsSoleFacing = false;
  let rightThighA = 0, rightKneeA = 0, rightFootIsSoleFacing = false;
  let leftArmA = 0, leftElbowA = 0;
  let rightArmA = 0, rightElbowA = 0;
  let hipOffset = 0;
  let lean = 0.16;
  let isWebShoot = false;
  let isSwing = false;

  if (frameIndex === 0) {
    // RUN_0: Left leg forward plant, Right leg kicked back high!
    hipOffset = 2;
    leftThighA = 0.45; leftKneeA = 0.35; leftFootIsSoleFacing = false;
    rightThighA = -0.75; rightKneeA = 1.65; rightFootIsSoleFacing = true; // Sole faces camera!
    leftArmA = 0.65; leftElbowA = 0.85;   // Left arm back
    rightArmA = -0.65; rightElbowA = 0.85; // Right arm forward
  } else if (frameIndex === 1) {
    // RUN_1: Left leg mid-stance, Right knee driving forward
    hipOffset = 7.5; // Lowest vertical stride bob
    leftThighA = 0.15; leftKneeA = 0.45; leftFootIsSoleFacing = false;
    rightThighA = -0.20; rightKneeA = 1.35; rightFootIsSoleFacing = false;
    leftArmA = 0.35; leftElbowA = 0.80;
    rightArmA = -0.35; rightElbowA = 0.80;
  } else if (frameIndex === 2) {
    // RUN_2: Left leg toe push-off, Right knee driving high forward
    hipOffset = -2;
    leftThighA = -0.65; leftKneeA = 0.25; leftFootIsSoleFacing = true;
    rightThighA = 0.55; rightKneeA = 1.45; rightFootIsSoleFacing = false;
    leftArmA = -0.55; leftElbowA = 0.85;
    rightArmA = 0.55; rightElbowA = 0.85;
  } else if (frameIndex === 3) {
    // RUN_3: Airborne Flight Phase 1! Both feet off the ground
    hipOffset = -9.0; // Peak vertical apex
    leftThighA = -0.80; leftKneeA = 0.65; leftFootIsSoleFacing = true;
    rightThighA = 0.65; rightKneeA = 0.55; rightFootIsSoleFacing = false;
    leftArmA = -0.75; leftElbowA = 0.85;
    rightArmA = 0.75; rightElbowA = 0.85;
  } else if (frameIndex === 4) {
    // RUN_4: Right leg forward plant, Left leg kicked back high!
    hipOffset = 2;
    rightThighA = 0.45; rightKneeA = 0.35; rightFootIsSoleFacing = false;
    leftThighA = -0.75; leftKneeA = 1.65; leftFootIsSoleFacing = true; // Sole faces camera!
    rightArmA = 0.65; rightElbowA = 0.85; // Right arm back
    leftArmA = -0.65; leftElbowA = 0.85;   // Left arm forward
  } else if (frameIndex === 5) {
    // RUN_5: Right leg mid-stance, Left knee driving forward
    hipOffset = 7.5; // Lowest vertical stride bob
    rightThighA = 0.15; rightKneeA = 0.45; rightFootIsSoleFacing = false;
    leftThighA = -0.20; leftKneeA = 1.35; leftFootIsSoleFacing = false;
    rightArmA = 0.35; rightElbowA = 0.80;
    leftArmA = -0.35; leftElbowA = 0.80;
  } else if (frameIndex === 6) {
    // RUN_6: Right leg toe push-off, Left knee driving high forward
    hipOffset = -2;
    rightThighA = -0.65; rightKneeA = 0.25; rightFootIsSoleFacing = true;
    leftThighA = 0.55; leftKneeA = 1.45; leftFootIsSoleFacing = false;
    rightArmA = -0.55; rightElbowA = 0.85;
    leftArmA = 0.55; leftElbowA = 0.85;
  } else if (frameIndex === 7) {
    // RUN_7: Airborne Flight Phase 2! Both feet off the ground
    hipOffset = -9.0; // Peak vertical apex
    rightThighA = -0.80; rightKneeA = 0.65; rightFootIsSoleFacing = true;
    leftThighA = 0.65; leftKneeA = 0.55; leftFootIsSoleFacing = false;
    rightArmA = -0.75; rightElbowA = 0.85;
    leftArmA = 0.75; leftElbowA = 0.85;
  } else if (frameIndex === 8) {
    // JUMP: Rising Takeoff Leap away from camera into the air
    hipOffset = -15;
    lean = -0.04;
    leftThighA = -0.45; leftKneeA = 1.30; leftFootIsSoleFacing = true;
    rightThighA = 0.80; rightKneeA = 1.50; rightFootIsSoleFacing = false;
    leftArmA = -1.25; leftElbowA = 0.85;
    rightArmA = -1.05; rightElbowA = 0.85;
  } else if (frameIndex === 9) {
    // FALL: Airborne Descent Glide
    hipOffset = -8;
    lean = 0.10;
    leftThighA = 0.20; leftKneeA = 0.40; leftFootIsSoleFacing = false;
    rightThighA = -0.15; rightKneeA = 0.42; rightFootIsSoleFacing = false;
    leftArmA = -0.70; leftElbowA = 0.45;
    rightArmA = 0.70; rightElbowA = 0.45;
  } else if (frameIndex === 10) {
    // LAND: Impact Compression Squash (feet planted flat on surface)
    hipOffset = 22; // low pelvis crouch
    lean = 0.32;
    leftThighA = 0.90; leftKneeA = 1.55; leftFootIsSoleFacing = false;
    rightThighA = 0.90; rightKneeA = 1.55; rightFootIsSoleFacing = false;
    leftArmA = 0.90; leftElbowA = 0.85;
    rightArmA = 0.90; rightElbowA = 0.85;
  } else if (frameIndex === 11) {
    // WEB_SHOOT: Right arm outstretched forward-upward at overhead pipe
    lean = 0.22;
    leftThighA = -0.35; leftKneeA = 0.70; leftFootIsSoleFacing = false;
    rightThighA = 0.28; rightKneeA = 0.48; rightFootIsSoleFacing = false;
    leftArmA = 0.65; leftElbowA = 0.75;
    isWebShoot = true;
  } else if (frameIndex === 12) {
    // WEB_ATTACHED: Holding taut line
    lean = 0.26;
    leftThighA = -0.45; leftKneeA = 0.85; leftFootIsSoleFacing = false;
    rightThighA = 0.35; rightKneeA = 0.65; rightFootIsSoleFacing = false;
    leftArmA = 0.55; leftElbowA = 0.85;
    isWebShoot = true;
  } else if (frameIndex === 13) {
    // SWING: Pendulum arc swing, legs trailing behind in wind
    hipOffset = -10;
    lean = 0.38;
    leftThighA = -0.70; leftKneeA = 1.05; leftFootIsSoleFacing = true;
    rightThighA = -0.90; rightKneeA = 1.25; rightFootIsSoleFacing = true;
    leftArmA = -0.90; leftElbowA = 0.45;
    isSwing = true;
  } else if (frameIndex === 14) {
    // TRAIN_RUN: High-speed rooftop sprint
    hipOffset = 4;
    lean = 0.20;
    leftThighA = 0.40; leftKneeA = 0.45; leftFootIsSoleFacing = false;
    rightThighA = -0.70; rightKneeA = 1.55; rightFootIsSoleFacing = true;
    leftArmA = 0.70; leftElbowA = 0.90;
    rightArmA = -0.70; rightElbowA = 0.90;
  } else if (frameIndex === 15) {
    // LEAVE_TRAIN: Stepping off edge into flight
    hipOffset = -6;
    lean = 0.24;
    leftThighA = -0.55; leftKneeA = 0.85; leftFootIsSoleFacing = true;
    rightThighA = 0.40; rightKneeA = 0.55; rightFootIsSoleFacing = false;
    leftArmA = -0.55; leftElbowA = 0.65;
    rightArmA = 0.65; rightElbowA = 0.65;
  }

  const hipX = ox;
  const hipY = oy - 72 + hipOffset;

  const torsoH = 44;
  const chestX = hipX + Math.sin(lean) * torsoH;
  const chestY = hipY - Math.cos(lean) * torsoH;

  // Head positioned on neck, facing FORWARD down the track
  const headX = chestX + Math.sin(lean) * 15;
  const headY = chestY - Math.cos(lean) * 15 - 18;

  // Shoulders (Broad athletic span)
  const leftShoulderX = chestX - 22;
  const leftShoulderY = chestY + 2;
  const rightShoulderX = chestX + 22;
  const rightShoulderY = chestY + 2;

  // Hips
  const leftHipX = hipX - 12;
  const leftHipY = hipY;
  const rightHipX = hipX + 12;
  const rightHipY = hipY;

  // =========================================================================
  // DRAWING ORDER: BACK TO FRONT (REAR VIEW)
  // =========================================================================

  // 1. Far (Left) Arm
  drawRearArm(leftShoulderX, leftShoulderY, leftArmA + lean, leftElbowA, true);

  // 2. Far (Left) Leg
  drawRearLeg(leftHipX, leftHipY, leftThighA + lean * 0.45, leftKneeA, leftFootIsSoleFacing, true);

  // 3. Near (Right) Leg
  drawRearLeg(rightHipX, rightHipY, rightThighA + lean * 0.45, rightKneeA, rightFootIsSoleFacing, false);

  // 4. Broad Athletic Torso & Subway Runner Jacket (REAR VIEW)
  drawRearJacketTorso(hipX, hipY, chestX, chestY, lean);

  // 5. Near (Right) Arm
  if (isWebShoot) {
    // Right arm outstretched forward-upward toward overhead pipe
    drawOutstretchedRearArm(rightShoulderX, rightShoulderY, ox + 38, oy - 152);
  } else if (isSwing) {
    // Right arm holding web line overhead
    drawOutstretchedRearArm(rightShoulderX, rightShoulderY, ox + 18, oy - 168);
  } else {
    drawRearArm(rightShoulderX, rightShoulderY, rightArmA + lean, rightElbowA, false);
  }

  // 6. Fabric Hood resting on upper back/neck
  drawRearHood(chestX, chestY - 8);

  // 7. Masked Spider-Man Head (REAR / 3/4 VIEW facing forward down the track)
  drawRearSpiderHead(headX, headY, lean * 0.3);
}

/**
 * Draws an anatomical muscular leg from the REAR view
 */
function drawRearLeg(hipX, hipY, thighA, kneeA, isSoleFacingCamera, isFar) {
  const thighLen = 30;
  const shinLen = 32;

  const kneeX = hipX + Math.sin(thighA) * thighLen;
  const kneeY = hipY + Math.cos(thighA) * thighLen;

  const shinA = thighA + kneeA;
  const ankleX = kneeX + Math.sin(shinA) * shinLen;
  const ankleY = kneeY + Math.cos(shinA) * shinLen;

  const pantsColor = isFar ? C_NAVY_FAR : C_NAVY;
  const bootColor = isFar ? C_RED_FAR : C_RED;
  const soleColor = isFar ? C_WHITE_FAR : C_WHITE;

  // 1. Thigh (Muscular hamstring / quad from back)
  canvas.fillCapsule(hipX, hipY, kneeX, kneeY, 9.5, C_OUTLINE);
  canvas.fillCapsule(hipX, hipY, kneeX, kneeY, 7.5, pantsColor);

  // 2. Popliteal knee crease joint
  canvas.fillCircle(kneeX, kneeY, 7.5, C_OUTLINE);
  canvas.fillCircle(kneeX, kneeY, 6.0, pantsColor);

  // 3. Muscular Gastrocnemius Calf tapering to Achilles tendon
  canvas.fillCapsule(kneeX, kneeY, ankleX, ankleY, 8.0, C_OUTLINE);
  canvas.fillCapsule(kneeX, kneeY, ankleX, ankleY, 6.5, bootColor);

  // 4. High-Top Sneaker
  if (isSoleFacingCamera) {
    // FOOT KICKED BACK: Sneaker sole is facing the camera!
    // Heel counter at top, white rubber midsole oval, black rubber tread facing us!
    canvas.fillCircle(ankleX, ankleY, 6.5, C_OUTLINE);
    canvas.fillCircle(ankleX, ankleY, 5.0, bootColor); // Heel counter

    // Oval sole facing camera
    canvas.fillCapsule(ankleX - 6, ankleY + 2, ankleX + 6, ankleY + 2, 5.5, C_OUTLINE);
    canvas.fillCapsule(ankleX - 6, ankleY + 2, ankleX + 6, ankleY + 2, 4.0, soleColor);
    // Black tread pattern facing camera
    canvas.fillCapsule(ankleX - 5, ankleY + 2, ankleX + 5, ankleY + 2, 2.5, C_TREAD);
  } else {
    // FOOT PLANTED FORWARD: Heel striking ground, toe pointing forward into distance
    const footA = shinA - 0.72;
    const footLen = 22;
    const toeX = ankleX + Math.sin(footA) * footLen;
    const toeY = ankleY + Math.cos(footA) * footLen * 0.38;

    // Sneaker upper
    canvas.fillCapsule(ankleX - 3, ankleY, toeX, toeY, 6.5, C_OUTLINE);
    canvas.fillCapsule(ankleX - 3, ankleY, toeX, toeY, 5.0, bootColor);

    // White rubber cupsole contacting ground
    canvas.fillCapsule(ankleX - 4, ankleY + 3, toeX + 2, toeY + 3, 3.0, C_OUTLINE);
    canvas.fillCapsule(ankleX - 4, ankleY + 3, toeX + 2, toeY + 3, 2.0, soleColor);
    // Black tread under sole
    canvas.fillCapsule(ankleX - 4, ankleY + 4, toeX + 2, toeY + 4, 1.4, C_TREAD);
  }
}

/**
 * Draws upper arm, sleeve with light-blue stripe, cuff, and red glove from REAR view
 */
function drawRearArm(shoulderX, shoulderY, shoulderA, elbowA, isFar) {
  const bicepLen = 22;
  const forearmLen = 22;

  const elbowX = shoulderX + Math.sin(shoulderA) * bicepLen;
  const elbowY = shoulderY + Math.cos(shoulderA) * bicepLen;

  const forearmA = shoulderA + elbowA;
  const handX = elbowX + Math.sin(forearmA) * forearmLen;
  const handY = elbowY + Math.cos(forearmA) * forearmLen;

  const jacketColor = isFar ? C_CREAM_FAR : C_CREAM;
  const stripeColor = isFar ? C_BLUE_YOKE : C_BLUE_STRIPE;
  const gloveColor = isFar ? C_RED_FAR : C_RED;

  // Upper arm sleeve
  canvas.fillCapsule(shoulderX, shoulderY, elbowX, elbowY, 7.5, C_OUTLINE);
  canvas.fillCapsule(shoulderX, shoulderY, elbowX, elbowY, 5.8, jacketColor);
  canvas.fillCapsule(shoulderX, shoulderY, elbowX, elbowY, 2.2, stripeColor);

  // Elbow fold
  canvas.fillCircle(elbowX, elbowY, 5.5, jacketColor);

  // Forearm sleeve
  canvas.fillCapsule(elbowX, elbowY, handX, handY, 6.5, C_OUTLINE);
  canvas.fillCapsule(elbowX, elbowY, handX, handY, 5.0, jacketColor);

  // Ribbed dark wrist cuff
  const cuffX = elbowX + (handX - elbowX) * 0.75;
  const cuffY = elbowY + (handY - elbowY) * 0.75;
  canvas.fillCircle(cuffX, cuffY, 4.5, C_OUTLINE);

  // Red superhero glove
  canvas.fillCircle(handX, handY, 5.5, C_OUTLINE);
  canvas.fillCircle(handX, handY, 4.2, gloveColor);
}

/**
 * Draws outstretched arm for web shooting / swinging
 */
function drawOutstretchedRearArm(shoulderX, shoulderY, handX, handY) {
  // Sleeve
  canvas.fillCapsule(shoulderX, shoulderY, handX, handY, 7.5, C_OUTLINE);
  canvas.fillCapsule(shoulderX, shoulderY, handX, handY, 5.8, C_CREAM);
  canvas.fillCapsule(shoulderX, shoulderY, handX, handY, 2.2, C_BLUE_STRIPE);

  // Wrist cuff
  const cuffX = shoulderX + (handX - shoulderX) * 0.80;
  const cuffY = shoulderY + (handY - shoulderY) * 0.80;
  canvas.fillCircle(cuffX, cuffY, 4.5, C_OUTLINE);

  // Red glove
  canvas.fillCircle(handX, handY, 5.5, C_OUTLINE);
  canvas.fillCircle(handX, handY, 4.2, C_RED);

  // Cyan web nozzle flash
  canvas.fillCircle(handX, handY, 3.2, C_CYAN);
  canvas.fillCircle(handX, handY, 1.5, C_WHITE);
}

/**
 * Draws the Torso and Subway Runner Jacket from the REAR view
 */
function drawRearJacketTorso(hipX, hipY, chestX, chestY, lean) {
  // 1. Broad V-taper jacket back
  canvas.fillCapsule(chestX - 16, chestY, hipX - 10, hipY, 9.0, C_OUTLINE);
  canvas.fillCapsule(chestX + 16, chestY, hipX + 10, hipY, 9.0, C_OUTLINE);
  canvas.fillCapsule(chestX - 15, chestY, hipX - 9, hipY, 7.5, C_CREAM);
  canvas.fillCapsule(chestX + 15, chestY, hipX + 9, hipY, 7.5, C_CREAM);

  // Center jacket back fill
  canvas.fillCapsule(chestX, chestY, hipX, hipY, 14.0, C_OUTLINE);
  canvas.fillCapsule(chestX, chestY, hipX, hipY, 12.5, C_CREAM);

  // 2. Light-Blue Denim Shoulder Yoke (Across upper back / shoulder blades)
  canvas.fillCapsule(chestX - 18, chestY - 3, chestX + 18, chestY - 3, 7.0, C_OUTLINE);
  canvas.fillCapsule(chestX - 17, chestY - 3, chestX + 17, chestY - 3, 5.5, C_BLUE_YOKE);

  // Double stitch seam line across middle back
  canvas.fillCapsule(chestX - 16, chestY + 2, chestX + 16, chestY + 2, 1.2, [2, 110, 170]);

  // Center back spinal fabric fold
  canvas.fillCapsule(chestX, chestY + 3, hipX, hipY - 2, 1.2, [210, 220, 230]);

  // 3. Dark ribbed waistband hugging the hips
  canvas.fillCapsule(hipX - 12, hipY, hipX + 12, hipY, 4.0, [30, 41, 59]);
}

/**
 * Draws the fabric hood draped on the upper back and neck
 */
function drawRearHood(chestX, chestY) {
  // Dark contour
  canvas.fillCircle(chestX, chestY + 2, 14, C_OUTLINE);
  // Cream exterior hood
  canvas.fillCircle(chestX, chestY + 2, 12, C_CREAM);
  // Light blue inner hood cavity
  canvas.fillCircle(chestX, chestY + 1, 8, C_BLUE_STRIPE);
}

/**
 * Draws the Masked Spider-Man Head from REAR / 3/4 VIEW facing forward into the track
 */
function drawRearSpiderHead(hx, hy, tilt) {
  // Red Mask Dome (Rear skull crown)
  canvas.fillCircle(hx, hy, 16.5, C_OUTLINE);
  canvas.fillCircle(hx, hy, 14.5, C_RED);

  // Webbing lines across the rear cowl (vertical center seam + radial web arcs)
  canvas.fillCapsule(hx, hy - 14, hx, hy + 14, 1.0, C_RED_SHADOW);
  canvas.fillCapsule(hx - 12, hy - 2, hx + 12, hy - 2, 1.0, C_RED_SHADOW);
  canvas.fillCapsule(hx - 10, hy + 6, hx + 10, hy + 6, 0.9, C_RED_SHADOW);
  canvas.fillCapsule(hx - 8, hy - 8, hx + 8, hy - 8, 0.9, C_RED_SHADOW);

  // IN 3/4 BACK VIEW:
  // The character's head is facing forward down the track into the horizon.
  // We ONLY see the sleek outer temple edge of the white eye lens wrapping
  // around the front-right silhouette, confirming it's Spider-Man while looking FORWARD!
  canvas.fillCapsule(hx + 12, hy - 3, hx + 13, hy + 2, 2.5, C_OUTLINE);
  canvas.fillCapsule(hx + 12, hy - 3, hx + 13, hy + 2, 1.6, C_WHITE);
}

// Generate all 16 frames
console.log('Rendering 16 REAR / 3/4-BACK superhero frames...');
for (let i = 0; i < 16; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const ox = col * FRAME_WIDTH + 80;
  const oy = row * FRAME_HEIGHT + 188;
  drawRearSuperheroFrame(i, ox, oy);
}

// Write to public/assets/player_spritesheet.png
const outDir = path.resolve('public', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'player_spritesheet.png');
console.log('Encoding PNG to:', outFile);
const pngData = encodePNG(ATLAS_WIDTH, ATLAS_HEIGHT, canvas.buffer);
fs.writeFileSync(outFile, pngData);
console.log(`Successfully generated ${outFile} (${pngData.length} bytes, ${ATLAS_WIDTH}x${ATLAS_HEIGHT})`);

// Also copy to dist/assets/player_spritesheet.png if dist exists
const distDir = path.resolve('dist', 'assets');
if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'player_spritesheet.png'), pngData);
  console.log('Copied to dist/assets/player_spritesheet.png');
}
