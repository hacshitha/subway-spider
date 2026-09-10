import Phaser from 'phaser';

export class UIScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private controlModeBadge!: Phaser.GameObjects.Text;
  private pauseBtnText!: Phaser.GameObjects.Text;
  private soundBtnText!: Phaser.GameObjects.Text;

  // Pause menu elements
  private pauseContainer!: Phaser.GameObjects.Container;

  // Game over elements
  private gameOverContainer!: Phaser.GameObjects.Container;
  private finalScoreText!: Phaser.GameObjects.Text;
  private finalCoinsText!: Phaser.GameObjects.Text;
  private finalDistText!: Phaser.GameObjects.Text;
  private finalBestText!: Phaser.GameObjects.Text;
  private newRecordBadge!: Phaser.GameObjects.Text;

  constructor() {
    super('UIScene');
  }

  public create(): void {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    // 1. Top Left HUD: Score, Coins & Distance
    const leftHudBg = this.add.graphics();
    leftHudBg.fillStyle(0x0f172a, 0.70);
    leftHudBg.fillRoundedRect(16, 14, 230, 84, 14);
    leftHudBg.lineStyle(1.5, 0x38bdf8, 0.5);
    leftHudBg.strokeRoundedRect(16, 14, 230, 84, 14);

    this.scoreText = this.add.text(28, 22, 'SCORE: 0', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '18px',
      color: '#ffffff'
    });
    this.scoreText.setShadow(2, 2, '#0284c7', 2, false, true);

    this.coinsText = this.add.text(28, 48, '🪙 COINS: 0', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#ffb703'
    });

    this.distText = this.add.text(28, 70, '🏃 DIST: 0m', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#38bdf8'
    });

    // 2. Top Center HUD: Speedometer & Control Mode
    const centerHudBg = this.add.graphics();
    centerHudBg.fillStyle(0x0f172a, 0.70);
    centerHudBg.fillRoundedRect(w / 2 - 110, 14, 220, 56, 14);
    centerHudBg.lineStyle(1.5, 0x0284c7, 0.4);
    centerHudBg.strokeRoundedRect(w / 2 - 110, 14, 220, 56, 14);

    this.speedText = this.add.text(w / 2, 22, '380 KM/H', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '15px',
      color: '#38bdf8'
    }).setOrigin(0.5, 0);

    this.controlModeBadge = this.add.text(w / 2, 45, '📷 CAMERA MODE', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#cbd5e1'
    }).setOrigin(0.5, 0);

    // 3. Top Right Actions: Pause (P) & Sound Toggle
    const actionsBg = this.add.graphics();
    actionsBg.fillStyle(0x0f172a, 0.70);
    actionsBg.fillRoundedRect(w - 115, 14, 98, 44, 12);
    actionsBg.lineStyle(1.5, 0x38bdf8, 0.4);
    actionsBg.strokeRoundedRect(w - 115, 14, 98, 44, 12);

    // Pause button
    this.pauseBtnText = this.add.text(w - 90, 24, '⏸️', {
      fontSize: '18px'
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });

    this.pauseBtnText.on('pointerdown', () => {
      const gs = this.scene.get('GameScene') as any;
      if (gs && gs.togglePause) {
        gs.togglePause();
      }
    });

    // Sound button
    this.soundBtnText = this.add.text(w - 45, 24, '🔊', {
      fontSize: '18px'
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });

    this.soundBtnText.on('pointerdown', () => {
      const gs = this.scene.get('GameScene') as any;
      if (gs && gs.getAudioManager) {
        const audio = gs.getAudioManager();
        const isMuted = audio.toggleMute();
        this.soundBtnText.setText(isMuted ? '🔇' : '🔊');
      }
    });

    // Web Action Banner
    const webNotice = this.add.text(w / 2, 85, '', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '14px',
      color: '#00f0ff'
    }).setOrigin(0.5, 0);
    webNotice.setShadow(2, 2, '#000000', 3, false, true);

    // Build In-Game Menus
    this.buildPauseModal(w, h);
    this.buildGameOverModal(w, h);

    // Wire up events from GameScene
    const gameScene = this.scene.get('GameScene');
    gameScene.events.on('updateScore', this.onUpdateScore, this);
    gameScene.events.on('gameOver', this.onGameOver, this);
    gameScene.events.on('gameRestart', this.onGameRestart, this);
    gameScene.events.on('gamePaused', this.onGamePaused, this);
    gameScene.events.on('gameResumed', this.onGameResumed, this);

    gameScene.events.on('webNotice', (msg: string) => {
      webNotice.setText(msg);
      webNotice.setAlpha(1);
      this.tweens.killTweensOf(webNotice);
      this.tweens.add({
        targets: webNotice,
        alpha: 0,
        delay: 1300,
        duration: 400
      });
    });
  }

  private buildPauseModal(w: number, h: number): void {
    this.pauseContainer = this.add.container(w / 2, h / 2);
    this.pauseContainer.setVisible(false);
    this.pauseContainer.setDepth(150);

    // Dark blurred backdrop
    const backdrop = this.add.rectangle(0, 0, w * 2, h * 2, 0x070b14, 0.85);

    // Card background
    const card = this.add.graphics();
    card.fillStyle(0x0f172a, 0.96);
    card.fillRoundedRect(-170, -160, 340, 320, 20);
    card.lineStyle(2.5, 0x38bdf8, 0.8);
    card.strokeRoundedRect(-170, -160, 340, 320, 20);

    const title = this.add.text(0, -115, 'PAUSED', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '32px',
      color: '#38bdf8'
    }).setOrigin(0.5);
    title.setShadow(3, 3, '#0284c7', 3, false, true);

    const subtitle = this.add.text(0, -80, 'SUBWAY SPIDER ON HOLD', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#94a3b8'
    }).setOrigin(0.5);

    // 1. Resume Button
    const resumeBtnBg = this.add.graphics();
    resumeBtnBg.fillStyle(0x0284c7, 1);
    resumeBtnBg.fillRoundedRect(-120, -45, 240, 44, 12);
    const resumeText = this.add.text(0, -23, '▶️ RESUME', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '15px',
      color: '#ffffff'
    }).setOrigin(0.5);
    const resumeHit = this.add.rectangle(0, -23, 240, 44, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    resumeHit.on('pointerdown', () => {
      const gs = this.scene.get('GameScene') as any;
      if (gs && gs.resumeGame) gs.resumeGame();
    });

    // 2. Restart Button
    const restartBtnBg = this.add.graphics();
    restartBtnBg.fillStyle(0x334155, 1);
    restartBtnBg.fillRoundedRect(-120, 15, 240, 44, 12);
    const restartText = this.add.text(0, 37, '🔄 RESTART RUN', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '15px',
      color: '#ffffff'
    }).setOrigin(0.5);
    const restartHit = this.add.rectangle(0, 37, 240, 44, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    restartHit.on('pointerdown', () => {
      this.pauseContainer.setVisible(false);
      const gs = this.scene.get('GameScene') as any;
      if (gs && gs.restartGame) gs.restartGame();
    });

    // 3. Main Menu Button
    const menuBtnBg = this.add.graphics();
    menuBtnBg.fillStyle(0x1e293b, 1);
    menuBtnBg.lineStyle(1.5, 0x64748b, 0.8);
    menuBtnBg.strokeRoundedRect(-120, 75, 240, 44, 12);
    menuBtnBg.fillRoundedRect(-120, 75, 240, 44, 12);
    const menuText = this.add.text(0, 97, '🏠 MAIN MENU', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '15px',
      color: '#cbd5e1'
    }).setOrigin(0.5);
    const menuHit = this.add.rectangle(0, 97, 240, 44, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    menuHit.on('pointerdown', () => {
      this.pauseContainer.setVisible(false);
      const gs = this.scene.get('GameScene') as any;
      if (gs && gs.returnToMainMenu) gs.returnToMainMenu();
    });

    this.pauseContainer.add([
      backdrop,
      card,
      title,
      subtitle,
      resumeBtnBg,
      resumeText,
      resumeHit,
      restartBtnBg,
      restartText,
      restartHit,
      menuBtnBg,
      menuText,
      menuHit
    ]);
  }

  private buildGameOverModal(w: number, h: number): void {
    this.gameOverContainer = this.add.container(w / 2, h / 2);
    this.gameOverContainer.setVisible(false);
    this.gameOverContainer.setDepth(150);

    // Dim backdrop
    const backdrop = this.add.rectangle(0, 0, w * 2, h * 2, 0x0a0f1d, 0.88);

    // Card background
    const card = this.add.graphics();
    card.fillStyle(0x0f172a, 0.97);
    card.fillRoundedRect(-180, -210, 360, 420, 22);
    card.lineStyle(3, 0xe63946, 0.9);
    card.strokeRoundedRect(-180, -210, 360, 420, 22);

    const title = this.add.text(0, -165, 'GAME OVER', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '34px',
      color: '#e63946'
    }).setOrigin(0.5);
    title.setShadow(3, 3, '#000000', 4, false, true);

    const subtitle = this.add.text(0, -128, 'SUBWAY SPIDER WIPEOUT', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#94a3b8'
    }).setOrigin(0.5);

    this.newRecordBadge = this.add.text(0, -102, '⭐ NEW HIGH SCORE! ⭐', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '13px',
      color: '#ffb703'
    }).setOrigin(0.5);
    this.newRecordBadge.setVisible(false);

    // Stats Section Container
    this.finalScoreText = this.add.text(0, -68, 'SCORE: 0', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '22px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.finalCoinsText = this.add.text(0, -32, '🪙 COINS: 0', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ffb703'
    }).setOrigin(0.5);

    this.finalDistText = this.add.text(0, -4, '🏃 DISTANCE: 0m', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#38bdf8'
    }).setOrigin(0.5);

    this.finalBestText = this.add.text(0, 26, '🏆 BEST: 0', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#e2e8f0'
    }).setOrigin(0.5);

    // 1. Play Again Button
    const playAgainBg = this.add.graphics();
    playAgainBg.fillStyle(0xe63946, 1);
    playAgainBg.fillRoundedRect(-130, 65, 260, 48, 12);
    const playAgainText = this.add.text(0, 89, '🔄 PLAY AGAIN', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '16px',
      color: '#ffffff'
    }).setOrigin(0.5);
    const playAgainHit = this.add.rectangle(0, 89, 260, 48, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    playAgainHit.on('pointerdown', () => {
      this.gameOverContainer.setVisible(false);
      const gs = this.scene.get('GameScene') as any;
      if (gs && gs.restartGame) gs.restartGame();
    });

    // 2. Main Menu Button
    const menuBg = this.add.graphics();
    menuBg.fillStyle(0x1e293b, 1);
    menuBg.lineStyle(1.5, 0x38bdf8, 0.6);
    menuBg.strokeRoundedRect(-130, 125, 260, 44, 12);
    menuBg.fillRoundedRect(-130, 125, 260, 44, 12);
    const menuText = this.add.text(0, 147, '🏠 MAIN MENU', {
      fontFamily: 'Bungee, sans-serif',
      fontSize: '15px',
      color: '#38bdf8'
    }).setOrigin(0.5);
    const menuHit = this.add.rectangle(0, 147, 260, 44, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    menuHit.on('pointerdown', () => {
      this.gameOverContainer.setVisible(false);
      const gs = this.scene.get('GameScene') as any;
      if (gs && gs.returnToMainMenu) gs.returnToMainMenu();
    });

    const tip = this.add.text(0, 185, 'Press SPACE to Play Again', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#64748b'
    }).setOrigin(0.5);

    this.gameOverContainer.add([
      backdrop,
      card,
      title,
      subtitle,
      this.newRecordBadge,
      this.finalScoreText,
      this.finalCoinsText,
      this.finalDistText,
      this.finalBestText,
      playAgainBg,
      playAgainText,
      playAgainHit,
      menuBg,
      menuText,
      menuHit,
      tip
    ]);
  }

  private onUpdateScore(score: number, coins: number, speed: number, distance: number = 0): void {
    this.scoreText.setText(`SCORE: ${score}`);
    this.coinsText.setText(`🪙 COINS: ${coins}`);
    this.distText.setText(`🏃 DIST: ${distance}m`);
    this.speedText.setText(`${Math.floor(speed)} KM/H`);
  }

  private onGameOver(data: { score: number; coins: number; distance?: number; highScore: number }): void {
    this.finalScoreText.setText(`FINAL SCORE: ${data.score}`);
    this.finalCoinsText.setText(`🪙 COINS: ${data.coins}`);
    this.finalDistText.setText(`🏃 DISTANCE: ${data.distance ?? 0}m`);
    this.finalBestText.setText(`🏆 BEST: ${data.highScore}`);

    // If new best score
    if (data.score > 0 && data.score >= data.highScore) {
      this.newRecordBadge.setVisible(true);
    } else {
      this.newRecordBadge.setVisible(false);
    }

    this.gameOverContainer.setVisible(true);
  }

  private onGameRestart(): void {
    this.gameOverContainer.setVisible(false);
    this.pauseContainer.setVisible(false);
  }

  private onGamePaused(): void {
    this.pauseContainer.setVisible(true);
  }

  private onGameResumed(): void {
    this.pauseContainer.setVisible(false);
  }

  public setControlMode(modeText: string): void {
    if (this.controlModeBadge) {
      this.controlModeBadge.setText(modeText);
    }
  }
}
