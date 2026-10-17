// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// --- Main scene -------------------------------------------------------------
class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    this.load.image('ship_interior', 'imgs/ship_interior.png');
    // Load other textures and audio here, e.g.:
    // this.load.image('player', 'assets/player.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#16213e');

    // Full-screen background (source is 400x300, upscaled 2x for a crisp
    // pixel-art look). The PNG has a transparent margin, so the page
    // background color shows through around the ship.
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'ship_interior')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(0);

    this.titleText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'LD Jam 60', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, '800 x 600 base', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#8d99ae',
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Placeholder sprite to confirm the game loop runs.
    this.player = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 60, 40, 40, 0x2ec4b6)
      .setDepth(10);

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
  // Nearest-neighbor filtering for the whole game: the 400x300 background
  // upscaled 2x to 800x600 stays crisp.
  pixelArt: true,
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

// Keep the movement keys for the game even when the canvas doesn't have
// browser focus (e.g. right after a page reload).
game.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,W,A,S,D');
game.canvas.addEventListener('mousedown', () => game.canvas.focus());
