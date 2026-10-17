// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// How close (in px) the player's center must be to the top + left edges to
// enter the minigame.
const CORNER_ZONE = 40;

// --- Main scene -------------------------------------------------------------
class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    this.load.image('ship_interior', 'imgs/ship_interior.png');
    // Player: 2-frame spritesheet, 63x132 per frame.
    this.load.spritesheet('player', 'imgs/Sprite-0001.png', {
      frameWidth: 63,
      frameHeight: 132,
    });
    // Load other textures and audio here, e.g.:
    // this.load.image('bg', 'assets/bg.png');
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

    // Player: the character sprite, standing at the bottom-center of the
    // screen (feet on the edge) with the 2-frame idle animation looping.
    this.player = this.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT, 'player').setDepth(10);
    this.player.y = GAME_HEIGHT - this.player.displayHeight / 2;

    // The 'idle' animation is global to the game, so only register it once —
    // the main scene is restarted when returning from a minigame.
    if (!this.anims.exists('idle')) {
      this.anims.create({
        key: 'idle',
        frames: this.anims.generateFrameNumbers('player', { start: 0, end: 1 }),
        frameRate: 4,
        repeat: -1,
      });
    }
    this.player.play('idle');

    // Set once the corner triggers the minigame, so the scene transition is
    // only queued once (reset on every scene start).
    this._leaving = false;

    this.cursors = this.input.keyboard.createCursorKeys();
  }

  update(time, delta) {
    // Move the placeholder with the arrow keys / WASD.
    if (this.cursors.left.isDown) this.player.x -= 200 * (delta / 1000);
    if (this.cursors.right.isDown) this.player.x += 200 * (delta / 1000);
    if (this.cursors.up.isDown) this.player.y -= 200 * (delta / 1000);
    if (this.cursors.down.isDown) this.player.y += 200 * (delta / 1000);

    // Keep the sprite fully on screen.
    this.player.x = Phaser.Math.Clamp(this.player.x, this.player.displayWidth / 2, GAME_WIDTH - this.player.displayWidth / 2);
    this.player.y = Phaser.Math.Clamp(this.player.y, this.player.displayHeight / 2, GAME_HEIGHT - this.player.displayHeight / 2);

    // Enter the minigame as soon as the player reaches the top-left corner.
    const inCorner =
      this.player.x <= this.player.displayWidth / 2 + CORNER_ZONE &&
      this.player.y <= this.player.displayHeight / 2 + CORNER_ZONE;
    if (inCorner && !this._leaving) {
      this._leaving = true;
      this.scene.start('Minigame');
    }
  }
}

// --- Placeholder minigame scene ----------------------------------------------
// A stand-in minigame so the "enter minigame / Esc to leave" flow can be tested.
// Replace this with the real minigames later (each one should return to
// 'MainScene' on Esc).
class MinigameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Minigame' });
  }

  preload() {
    this.load.image('comrad64', 'imgs/comrad64.png');
  }

  create() {
    // Full-screen background (source is 800x600, the game resolution).
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'comrad64').setDepth(0);

    // Esc returns to the main ship screen.
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('MainScene');
    });
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
  scene: [MainScene, MinigameScene],
};

const game = new Phaser.Game(config);

// Keep the movement keys for the game even when the canvas doesn't have
// browser focus (e.g. right after a page reload).
game.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,W,A,S,D');
game.canvas.addEventListener('mousedown', () => game.canvas.focus());
