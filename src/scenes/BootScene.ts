import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  public preload(): void {
    // Generate any procedural textures if needed
  }

  public create(): void {
    // Launch main game and UI overlay scenes
    this.scene.start('GameScene');
    this.scene.start('UIScene');
  }
}
