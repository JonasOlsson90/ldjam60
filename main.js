// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// How close (in px) the player's center must be to the top + left edges for
// the navigation panel to open.
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

    // Navigation panel: a black backdrop that opens when the player reaches
    // the top-left corner. Minigame buttons and other features will be added
    // on top of it later. For now, clicking it launches the placeholder minigame.
    this.navPanel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000)
      .setDepth(100)
      .setVisible(false);
    this.navPanel.on('pointerdown', () => {
      if (this.navPanel.visible) this.scene.start('Minigame');
    });
    this.navHint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Click to enter the minigame\nESC to go back', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setVisible(false);
    this.panelOpen = false;

    // Esc closes the navigation panel: step the player out of the corner so
    // the panel hides again on the next update.
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.panelOpen) {
        this.player.x = GAME_WIDTH / 2;
        this.player.y = GAME_HEIGHT / 2;
      }
    });

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

    // Open the navigation panel when the player reaches the top-left corner,
    // and hide it again once they leave that zone.
    const inCorner =
      this.player.x <= this.player.displayWidth / 2 + CORNER_ZONE &&
      this.player.y <= this.player.displayHeight / 2 + CORNER_ZONE;
    if (inCorner !== this.panelOpen) {
      this.panelOpen = inCorner;
      this.navPanel.setVisible(inCorner);
      this.navHint.setVisible(inCorner);
      if (inCorner) {
        this.navPanel.setInteractive();
      } else {
        this.navPanel.disableInteractive();
      }
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

  create() {
    this.cameras.main.setBackgroundColor('#2b2b2b');

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'MINIGAME (placeholder)', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, 'Press ESC to return to the ship', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#8d99ae',
      })
      .setOrigin(0.5)
      .setDepth(10);

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
