// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Navigation screen trigger: the area in front of the computer on the desk in
// the ship's top-left cabin (game coordinates, measured from ship_interior.png,
// which is upscaled 2x). The navigation screen opens when the player's center
// enters this area.
const COMPUTER_ZONE = { x: 40, y: 150, width: 160, height: 110 };

// Remembers where the player stood when opening the navigation screen, so
// they return to the same spot afterwards (nudged right, out of the trigger
// zone, so the screen doesn't immediately reopen).
let playerReturnPos = null;

// Ship geometry (game coordinates, measured from ship_interior.png, which is
// displayed upscaled 2x): the heights of the two floors (the player's feet
// when standing on them) and the horizontal span of the ladder connecting
// them.
const FLOOR_TOP = 290;
const FLOOR_BOTTOM = 576;
const LADDER = { x: 360, width: 70 };

const MOVE_SPEED = 200; // px/s walking
const CLIMB_SPEED = 160; // px/s on the ladder
const GRAVITY = 1500; // px/s^2
const JUMP_SPEED = 550; // px/s upwards (reaches ~100 px high)

// Navigation screen: bounds of the monitor's screen inside comrad64.png
// (measured from the image). This is the field the ship will navigate in later.
const MONITOR_SCREEN = { x: 56, y: 63, width: 684, height: 464 };
// The goal square at the top-right of the monitor screen: the end station of
// the mission.
const GOAL_SIZE = 24;
const GOAL_MARGIN = 16;
const GOAL_X = MONITOR_SCREEN.x + MONITOR_SCREEN.width - GOAL_MARGIN - GOAL_SIZE / 2;
const GOAL_Y = MONITOR_SCREEN.y + GOAL_MARGIN + GOAL_SIZE / 2;

// --- Navigation simulation ---------------------------------------------------
// The ship shown on the navigation screen. This simulation ALWAYS runs in the
// background (whatever scene is active advances it); the scenes only
// visualize it. Later, other minigames will decide what the screen shows and
// steer the ship.
const SHIP_SPEED = 9; // px/s
const navSim = {
  // Position (game px, inside MONITOR_SCREEN) and pointing direction in
  // radians (0 = right, positive = clockwise). The ship constantly moves in
  // the direction it points to. Starts in the bottom left of the screen,
  // pointing up towards the goal.
  shipX: MONITOR_SCREEN.x + GOAL_MARGIN + 20,
  shipY: MONITOR_SCREEN.y + MONITOR_SCREEN.height - GOAL_MARGIN - 20,
  angle: -Math.PI / 2,
};

function updateNavSim(dt) {
  navSim.shipX += Math.cos(navSim.angle) * SHIP_SPEED * dt;
  navSim.shipY += Math.sin(navSim.angle) * SHIP_SPEED * dt;
  // Wrap around the monitor screen edges so the ship never disappears.
  const s = MONITOR_SCREEN;
  if (navSim.shipX < s.x) navSim.shipX += s.width;
  else if (navSim.shipX > s.x + s.width) navSim.shipX -= s.width;
  if (navSim.shipY < s.y) navSim.shipY += s.height;
  else if (navSim.shipY > s.y + s.height) navSim.shipY -= s.height;
}

// The ship is a small red triangle whose tip points along navSim.angle.
function createNavShip(scene, alpha, depth) {
  return scene.add
    .triangle(navSim.shipX, navSim.shipY, 14, 0, -9, -9, -9, 9, 0xff0000, alpha)
    .setDepth(depth);
}

function syncNavShip(ship) {
  ship.setPosition(navSim.shipX, navSim.shipY);
  ship.setRotation(navSim.angle);
}

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
    if (playerReturnPos) {
      // Returning from the navigation screen: restore the position, but
      // nudge right out of the computer's trigger zone.
      this.player.x = Math.max(
        playerReturnPos.x,
        COMPUTER_ZONE.x + COMPUTER_ZONE.width + this.player.displayWidth / 2 + 4
      );
      this.player.y = playerReturnPos.y;
    } else {
      this.player.y = FLOOR_BOTTOM - this.player.displayHeight / 2;
    }
    // Vertical velocity (px/s) while falling; 0 when standing or climbing.
    this.playerVy = 0;

    // The animations are global to the game, so only register them once —
    // the main scene is restarted when returning from the navigation screen.
    // Spritesheet: frames 1+2 = idle, frames 1+3 = walking, frame 4 = climbing.
    if (!this.anims.exists('idle')) {
      this.anims.create({
        key: 'idle',
        frames: this.anims.generateFrameNumbers('player', { frames: [0, 1] }),
        frameRate: 4,
        repeat: -1,
      });
    }
    if (!this.anims.exists('walk')) {
      this.anims.create({
        key: 'walk',
        frames: this.anims.generateFrameNumbers('player', { frames: [0, 2] }),
        frameRate: 8,
        repeat: -1,
      });
    }
    this.player.play('idle');
    // Current sprite state ('idle' | 'walk' | 'climb'), to only switch the
    // animation when the state actually changes.
    this.playerState = 'idle';

    // Debug overlay: a transparent, always-on-top view of the navigation
    // screen (monitor screen area, goal box, ship). The simulation behind it
    // always runs, no matter which scene is active.
    const ov = MONITOR_SCREEN;
    this.add
      .rectangle(ov.x + ov.width / 2, ov.y + ov.height / 2, ov.width, ov.height, 0xffffff, 0.06)
      .setDepth(1000);
    this.add.rectangle(GOAL_X, GOAL_Y, GOAL_SIZE, GOAL_SIZE, 0x00ff00, 0.5).setDepth(1001);
    this.navShipDebug = createNavShip(this, 0.6, 1002);

    // Set once the computer triggers the navigation screen, so the scene
    // transition is only queued once (reset on every scene start).
    this._leaving = false;

    // Set by the space bar (consumed in update): request a small jump.
    this.jumpRequested = false;
    this.input.keyboard.on('keydown-SPACE', () => {
      this.jumpRequested = true;
    });

    this.cursors = this.input.keyboard.createCursorKeys();
  }

  update(time, delta) {
    const dt = delta / 1000;
    const p = this.player;

    // Walking (always possible).
    if (this.cursors.left.isDown) p.x -= MOVE_SPEED * dt;
    if (this.cursors.right.isDown) p.x += MOVE_SPEED * dt;
    p.x = Phaser.Math.Clamp(p.x, p.displayWidth / 2, GAME_WIDTH - p.displayWidth / 2);

    const feet = () => p.y + p.displayHeight / 2;
    const onLadder = p.x >= LADDER.x && p.x <= LADDER.x + LADDER.width;
    const onFloor =
      Math.abs(feet() - FLOOR_TOP) < 2 || Math.abs(feet() - FLOOR_BOTTOM) < 2;

    if (onLadder && (this.cursors.up.isDown || this.cursors.down.isDown)) {
      // Climbing the ladder: no gravity while moving along it. The player may
      // climb as high as they want (up to the top of the screen); the lower
      // end of the ladder is the bottom floor.
      this.playerVy = 0;
      if (this.cursors.up.isDown) p.y -= CLIMB_SPEED * dt;
      else p.y += CLIMB_SPEED * dt;
      p.y = Phaser.Math.Clamp(
        p.y,
        p.displayHeight / 2,
        FLOOR_BOTTOM - p.displayHeight / 2
      );
    } else if (onLadder && !onFloor) {
      // Hanging on the ladder between the floors.
      this.playerVy = 0;
    } else {
      // A space-bar press while standing on a floor starts a small jump.
      if (this.jumpRequested && onFloor) {
        this.playerVy = -JUMP_SPEED;
      }

      // Gravity: accelerate downwards and land on the highest floor whose
      // level the feet reached or crossed this frame. (The crossing check
      // prevents tunneling through the top floor during a fast fall; the
      // small tolerance keeps a standing player from sinking through it.)
      const prevFeet = feet();
      this.playerVy += GRAVITY * dt;
      p.y += this.playerVy * dt;
      if (feet() >= FLOOR_TOP && prevFeet <= FLOOR_TOP + 4) {
        p.y = FLOOR_TOP - p.displayHeight / 2;
        this.playerVy = 0;
      } else if (feet() >= FLOOR_BOTTOM) {
        p.y = FLOOR_BOTTOM - p.displayHeight / 2;
        this.playerVy = 0;
      }
    }

    // The jump request is consumed (or discarded) every frame.
    this.jumpRequested = false;

    // Sprite state: climbing (on the ladder, moving or hanging mid-air),
    // walking, or idle. Switch the animation only on state changes.
    const moving = this.cursors.up.isDown || this.cursors.down.isDown;
    const state =
      onLadder && (moving || !onFloor)
        ? 'climb'
        : this.cursors.left.isDown || this.cursors.right.isDown
        ? 'walk'
        : 'idle';
    if (state !== this.playerState) {
      this.playerState = state;
      if (state === 'climb') {
        p.anims.stop();
        p.setFrame(3);
      } else {
        p.play(state);
      }
    }
    if (state === 'walk') {
      // Face the walking direction (flipped when walking left).
      p.setFlipX(this.cursors.left.isDown);
    } else if (state === 'climb' && moving) {
      // Flip the climbing frame back and forth while climbing.
      p.setFlipX(Math.floor(time / 250) % 2 === 0);
    }

    // Advance the navigation simulation and its debug overlay.
    updateNavSim(dt);
    syncNavShip(this.navShipDebug);

    // Open the navigation screen when the player walks up to the computer.
    const inZone =
      this.player.x >= COMPUTER_ZONE.x &&
      this.player.x <= COMPUTER_ZONE.x + COMPUTER_ZONE.width &&
      this.player.y >= COMPUTER_ZONE.y &&
      this.player.y <= COMPUTER_ZONE.y + COMPUTER_ZONE.height;
    if (inZone && !this._leaving) {
      this._leaving = true;
      playerReturnPos = { x: this.player.x, y: this.player.y };
      this.scene.start('navigationScreen');
    }
  }
}

// --- Navigation screen scene ---------------------------------------------------
// The ship's navigation screen, shown on the computer monitor. Later a ship
// will navigate towards the goal square here. Esc returns to 'MainScene'.
class NavigationScreenScene extends Phaser.Scene {
  constructor() {
    super({ key: 'navigationScreen' });
  }

  preload() {
    this.load.image('comrad64', 'imgs/comrad64.png');
  }

  create() {
    // Full-screen background (source is 800x600, the game resolution).
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'comrad64').setDepth(0);

    // The goal: a static square near the top-right corner of the monitor
    // screen, with a small margin. The ship navigates towards it.
    this.goal = this.add.rectangle(GOAL_X, GOAL_Y, GOAL_SIZE, GOAL_SIZE, 0x00ff00).setDepth(10);

    // The ship: a red triangle that moves in the direction it points to
    // (driven by the always-running navigation simulation).
    this.ship = createNavShip(this, 1, 10);

    // Esc returns to the main ship screen.
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('MainScene');
    });
  }

  update(time, delta) {
    // Advance the shared navigation simulation and show the ship's state.
    updateNavSim(delta / 1000);
    syncNavShip(this.ship);
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
  scene: [MainScene, NavigationScreenScene],
};

const game = new Phaser.Game(config);

// Keep the movement keys for the game even when the canvas doesn't have
// browser focus (e.g. right after a page reload).
game.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE');
game.canvas.addEventListener('mousedown', () => game.canvas.focus());
