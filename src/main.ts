import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { CameraController } from './camera/CameraController';
import { PoseController } from './camera/PoseController';
import { GestureController } from './camera/GestureController';

// Phaser Game Configuration
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 600,
  backgroundColor: '#0284c7', // Bright superhero sky base
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, GameScene, UIScene]
};

const game = new Phaser.Game(config);

// Camera and Vision instances
const cameraController = new CameraController('#webcam-video', '#webcam-canvas');
const poseController = new PoseController();
const gestureController = new GestureController();

let isCameraInitialized = false;
let currentControlMode: 'camera' | 'keyboard' = 'camera';

// DOM Elements: Main Menu
const mainMenuOverlay = document.getElementById('main-menu-overlay');
const menuHighScoreText = document.getElementById('menu-high-score');
const btnSelectCamera = document.getElementById('btn-select-camera');
const btnSelectKeyboard = document.getElementById('btn-select-keyboard');
const btnOpenInstructions = document.getElementById('btn-open-instructions');
const btnToggleSound = document.getElementById('btn-toggle-sound');
const soundIcon = document.getElementById('sound-icon');
const soundLabel = document.getElementById('sound-label');

// DOM Elements: Calibration Modal
const calibrationModal = document.getElementById('calibration-modal');
const calibTitle = document.getElementById('calib-title');
const calibDesc = document.getElementById('calib-desc');
const calibProgressBar = document.getElementById('calib-progress-bar');
const calibProgressLabel = document.getElementById('calib-progress-label');
const btnCancelCalibration = document.getElementById('btn-cancel-calibration');

// DOM Elements: How To Play Modal
const howToPlayModal = document.getElementById('how-to-play-modal');
const btnCloseInstructions = document.getElementById('btn-close-instructions');

// DOM Elements: Camera PiP Panel
const pipPanel = document.getElementById('camera-pip-panel');
const pipToggleBtn = document.getElementById('pip-toggle-btn');
const pipStatusText = document.getElementById('pip-status-text');
const laneBadge = document.getElementById('body-lane-badge');
const jumpBadge = document.getElementById('body-jump-badge');
const handBadge = document.getElementById('hand-status-badge');

// Helpers to access Phaser scenes
function getGameScene(): GameScene | null {
  if (game.scene && game.scene.isActive('GameScene')) {
    return game.scene.getScene('GameScene') as GameScene;
  }
  return null;
}

function getUIScene(): UIScene | null {
  if (game.scene && game.scene.isActive('UIScene')) {
    return game.scene.getScene('UIScene') as UIScene;
  }
  return null;
}

// Refresh High Score displayed in Main Menu
function updateMenuHighScore(): void {
  try {
    const saved = localStorage.getItem('subway_spider_highscore');
    const score = saved ? parseInt(saved, 10) || 0 : 0;
    if (menuHighScoreText) {
      menuHighScoreText.innerText = `BEST SCORE: ${score}`;
    }
  } catch {
    if (menuHighScoreText) {
      menuHighScoreText.innerText = 'BEST SCORE: 0';
    }
  }
}

// Show Main Menu overlay & pause background game
function showMainMenu(): void {
  updateMenuHighScore();
  if (mainMenuOverlay) {
    mainMenuOverlay.classList.remove('hidden');
  }
  if (pipPanel) {
    pipPanel.classList.add('hidden');
  }
  const gs = getGameScene();
  if (gs) {
    gs.pauseGame();
  }
}

// Start Game with Keyboard Mode
function startKeyboardMode(): void {
  currentControlMode = 'keyboard';

  // Hide modals
  if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
  if (calibrationModal) calibrationModal.classList.add('hidden');
  if (howToPlayModal) howToPlayModal.classList.add('hidden');

  // Hide Camera PiP (not needed in keyboard mode)
  if (pipPanel) pipPanel.classList.add('hidden');

  const gs = getGameScene();
  const ui = getUIScene();
  if (gs) {
    gs.setControlMode('keyboard');
    gs.restartGame();
    gs.resumeGame();
  }
  if (ui) {
    ui.setControlMode('⌨️ KEYBOARD MODE');
  }
}

// Start Game with Camera Mode
async function startCameraMode(): Promise<void> {
  currentControlMode = 'camera';

  // If camera is already initialized, launch directly!
  if (isCameraInitialized) {
    if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
    if (calibrationModal) calibrationModal.classList.add('hidden');
    if (pipPanel) pipPanel.classList.remove('hidden');

    const gs = getGameScene();
    const ui = getUIScene();
    if (gs) {
      gs.setControlMode('camera');
      gs.restartGame();
      gs.resumeGame();
    }
    if (ui) {
      ui.setControlMode('📷 CAMERA MODE');
    }
    return;
  }

  // Show calibration modal
  if (calibrationModal) calibrationModal.classList.remove('hidden');
  if (calibTitle) calibTitle.innerText = 'REQUESTING CAMERA';
  if (calibDesc) calibDesc.innerText = 'Please click "Allow" in your browser prompt to enable motion tracking.';
  if (calibProgressBar) calibProgressBar.style.width = '15%';
  if (calibProgressLabel) calibProgressLabel.innerText = 'Requesting camera access...';

  const cameraStarted = await cameraController.start();

  if (!cameraStarted) {
    alert('Webcam permission was not granted or camera is unavailable. Switching to Keyboard Mode!');
    startKeyboardMode();
    return;
  }

  // Camera stream active!
  if (pipPanel) pipPanel.classList.remove('hidden');
  if (calibTitle) calibTitle.innerText = 'LOADING VISION AI';
  if (calibDesc) calibDesc.innerText = 'Initializing Pose and Hand Tracking neural models...';
  if (calibProgressBar) calibProgressBar.style.width = '45%';
  if (calibProgressLabel) calibProgressLabel.innerText = 'Loading MediaPipe models (client-side)...';

  const [poseReady, handReady] = await Promise.all([
    poseController.init(),
    gestureController.init()
  ]);

  if (!poseReady && !handReady) {
    alert('Failed to initialize vision models. Switching to Keyboard Mode!');
    startKeyboardMode();
    return;
  }

  isCameraInitialized = true;
  if (calibProgressBar) calibProgressBar.style.width = '70%';
  if (calibTitle) calibTitle.innerText = 'STAND READY';
  if (calibDesc) calibDesc.innerText = 'Step back until your shoulders and hips are clearly visible in the preview.';
  if (calibProgressLabel) calibProgressLabel.innerText = 'Calibrating standing posture...';

  // Start vision processing loop
  const ctx = cameraController.getCanvasContext();
  cameraController.onFrame((video, timestamp) => {
    poseController.processVideoFrame(video, ctx, timestamp);
    gestureController.processVideoFrame(video, ctx, timestamp);
  });

  // 1. Lane change callback
  poseController.onLaneChange((lane) => {
    const gs = getGameScene();
    if (gs && currentControlMode === 'camera') {
      gs.setMotionLane(lane);
    }
    if (laneBadge) {
      const name = lane === -1 ? 'LEFT' : lane === 1 ? 'RIGHT' : 'CENTER';
      laneBadge.innerText = `LANE: ${name}`;
      laneBadge.classList.add('highlight');
      setTimeout(() => laneBadge?.classList.remove('highlight'), 250);
    }
  });

  // 2. Physical Jump callback
  poseController.onJump(() => {
    const gs = getGameScene();
    if (gs && currentControlMode === 'camera') {
      gs.triggerMotionJump();
    }
  });

  // 3. Jump state changes (subtle player HUD)
  poseController.onJumpStateChange((state) => {
    if (!jumpBadge) return;
    if (state === 'AIRBORNE') {
      jumpBadge.innerText = 'JUMP! ⚡';
      jumpBadge.classList.add('jump-active');
    } else if (state === 'LANDED' || state === 'GROUNDED') {
      jumpBadge.innerText = 'READY TO JUMP';
      jumpBadge.classList.remove('jump-active');
    }
  });

  // 4. Calibration progress listener
  poseController.onPoseData((data) => {
    if (data.jumpState === 'CALIBRATING') {
      const pct = Math.min(100, Math.round(70 + data.calibrationProgress * 30));
      if (calibProgressBar) calibProgressBar.style.width = `${pct}%`;
      if (calibProgressLabel) calibProgressLabel.innerText = `Calibrating: ${Math.round(data.calibrationProgress * 100)}%`;
    } else if (data.jumpState === 'GROUNDED' && calibrationModal && !calibrationModal.classList.contains('hidden')) {
      // Calibration complete! Launch game
      if (calibProgressBar) calibProgressBar.style.width = '100%';
      if (calibProgressLabel) calibProgressLabel.innerText = 'CALIBRATION COMPLETE! GET READY!';
      if (calibTitle) calibTitle.innerText = 'RUN! 🕷️';

      setTimeout(() => {
        if (calibrationModal) calibrationModal.classList.add('hidden');
        if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');

        const gs = getGameScene();
        const ui = getUIScene();
        if (gs) {
          gs.setControlMode('camera');
          gs.restartGame();
          gs.resumeGame();
        }
        if (ui) {
          ui.setControlMode('📷 CAMERA MODE');
        }
      }, 500);
    }
  });

  // 5. Hand Gesture (🤟 or 🤘) Web Shooting
  gestureController.onWebShoot(() => {
    const gs = getGameScene();
    if (gs && currentControlMode === 'camera') {
      gs.triggerWebShoot();
    }
    if (handBadge) {
      handBadge.innerText = 'WEB FIRED! 🕸️';
      handBadge.classList.add('web-active');
      setTimeout(() => handBadge?.classList.remove('web-active'), 500);
    }
  });

  // 6. Hand Tracking state changes
  gestureController.onStateChange((state) => {
    if (!handBadge) return;
    if (state === 'HAND_READY') {
      handBadge.innerText = 'HAND READY 🤟';
    } else if (state === 'HAND_OFFSCREEN') {
      handBadge.innerText = 'HAND: STANDBY';
    } else if (state === 'GESTURE_COOLDOWN') {
      handBadge.innerText = 'RECHARGING...';
    }
  });
}

// Attach Event Listeners
btnSelectCamera?.addEventListener('click', () => {
  const gs = getGameScene();
  if (gs) gs.getAudioManager().playButtonClick();
  startCameraMode();
});

btnSelectKeyboard?.addEventListener('click', () => {
  const gs = getGameScene();
  if (gs) gs.getAudioManager().playButtonClick();
  startKeyboardMode();
});

btnCancelCalibration?.addEventListener('click', () => {
  const gs = getGameScene();
  if (gs) gs.getAudioManager().playButtonClick();
  startKeyboardMode();
});

btnOpenInstructions?.addEventListener('click', () => {
  const gs = getGameScene();
  if (gs) gs.getAudioManager().playButtonClick();
  if (howToPlayModal) howToPlayModal.classList.remove('hidden');
});

btnCloseInstructions?.addEventListener('click', () => {
  const gs = getGameScene();
  if (gs) gs.getAudioManager().playButtonClick();
  if (howToPlayModal) howToPlayModal.classList.add('hidden');
});

btnToggleSound?.addEventListener('click', () => {
  const gs = getGameScene();
  if (gs) {
    const audio = gs.getAudioManager();
    const isMuted = audio.toggleMute();
    if (!isMuted) audio.playButtonClick();
    if (soundIcon) soundIcon.innerText = isMuted ? '🔇' : '🔊';
    if (soundLabel) soundLabel.innerText = isMuted ? 'SOUND: OFF' : 'SOUND: ON';
  }
});

pipToggleBtn?.addEventListener('click', () => {
  if (pipPanel) {
    pipPanel.classList.toggle('minimized');
    pipToggleBtn.innerText = pipPanel.classList.contains('minimized') ? '▢' : '_';
  }
});

// Setup Initial State once Phaser is ready
game.events.once('ready', () => {
  updateMenuHighScore();

  // Watch for returnToMainMenu event from GameScene
  const checkScene = setInterval(() => {
    const gs = getGameScene();
    if (gs) {
      clearInterval(checkScene);
      gs.events.on('returnToMainMenu', () => {
        showMainMenu();
      });
      // Pause game on initial opening until mode is picked
      gs.pauseGame();
    }
  }, 100);
});

// Initialize high score on load
updateMenuHighScore();
