// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// --- Main scene -------------------------------------------------------------
class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Load textures and audio here, e.g.:
    // this.load.image('player', 'assets/player.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#16213e');

    this.titleText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'LD Jam 60', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, '800 x 600 base', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#8d99ae',
      })
      .setOrigin(0.5);

    // Placeholder sprite to confirm the game loop runs.
    this.player = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 60, 40, 40, 0x2ec4b6);

    this.cursors = this.input.keyboard.createCursorKeys();
  }

  update(time, delta) {
    // Move the placeholder with the arrow keys / WASD.
    if (this.cursors.left.isDown) this.player.x -= 200 * (delta / 1000);
    if (this.cursors.right.isDown) this.player.x += 200 * (delta / 1000);
    if (this.cursors.up.isDown) this.player.y -= 200 * (delta / 1000);
    if (this.cursors.down.isDown) this.player.y += 200 * (delta / 1000);

    // Keep the placeholder inside the playfield.
    this.player.x = Phaser.Math.Clamp(this.player.x, 20, GAME_WIDTH - 20);
    this.player.y = Phaser.Math.Clamp(this.player.y, 20, GAME_HEIGHT - 20);
  }
}

// --- Game config ------------------------------------------------------------
const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game',
  backgroundColor: '#16213e',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [MainScene],
};

const game = new Phaser.Game(config);
