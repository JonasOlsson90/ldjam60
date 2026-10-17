// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Navigation screen trigger: the area in front of the computer on the desk in
// the ship's top-left cabin (game coordinates, measured from ship_interior.png,
// which is upscaled 2x). The navigation screen opens when the player's center
// enters this area.
const COMPUTER_ZONE = { x: 40, y: 150, width: 160, height: 110 };

// Electricity generator trigger: the area around the bike in the ship's
// bottom-left corner (game coordinates, measured from ship_interior.png).
const BIKE_ZONE = { x: 30, y: 440, width: 250, height: 130 };

// Remembers where the player stood when opening a minigame, so they return to
// the same spot afterwards (nudged right, out of the minigame's trigger zone,
// so it doesn't immediately reopen).
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
  // Real-time position (game px, inside MONITOR_SCREEN) and pointing
  // direction in radians (0 = right, positive = clockwise). The ship
  // constantly moves in the direction it points to. Starts in the bottom
  // left of the screen, pointing up towards the goal.
  shipX: MONITOR_SCREEN.x + GOAL_MARGIN + 20,
  shipY: MONITOR_SCREEN.y + MONITOR_SCREEN.height - GOAL_MARGIN - 20,
  angle: -Math.PI / 2,
  // The latest MEASURED position: this is what the navigation screen (and
  // its debug overlay) displays — not the real-time position. It is only
  // updated when the player climbs out of the top of the screen to take a
  // measurement.
  measuredX: MONITOR_SCREEN.x + GOAL_MARGIN + 20,
  measuredY: MONITOR_SCREEN.y + MONITOR_SCREEN.height - GOAL_MARGIN - 20,
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
  // The display shows the latest measured position, not the live one.
  ship.setPosition(navSim.measuredX, navSim.measuredY);
  ship.setRotation(navSim.angle);
}

// --- Power simulation ----------------------------------------------------------
// The ship's battery. It always drains slowly (whatever scene is active
// advances it); pedaling the bike in the electricityGenerator minigame
// recharges it.
const BATTERY_MAX = 100;
// Global speed factor for battery power depletion and generation
// (1 = normal speed, lower = slower).
const POWER_SPEED = 0.5;
const BATTERY_DRAIN = 1; // % per second (before POWER_SPEED)
const PEDAL_BOOST = 2; // % per pedal stroke (before POWER_SPEED)
const powerSim = { battery: BATTERY_MAX }; // 0..100 %

function updatePowerSim(dt) {
  powerSim.battery = Math.max(0, powerSim.battery - BATTERY_DRAIN * POWER_SPEED * dt);
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
      // Returning from a minigame: restore the position, but nudge right out
      // of the minigame's trigger zone so it doesn't immediately reopen.
      const z = playerReturnPos.zone;
      this.player.x = Math.max(
        playerReturnPos.x,
        z.x + z.width + this.player.displayWidth / 2 + 4
      );
      this.player.y = playerReturnPos.y;
    } else {
      this.player.y = FLOOR_BOTTOM - this.player.displayHeight / 2;
    }
    // Vertical velocity (px/s) while falling; 0 when standing or climbing.
    this.playerVy = 0;
    // True while a jump is airborne (so the ladder's hang doesn't grab the
    // player mid-jump); cleared on landing or when grabbing the ladder.
    this.jumpInAir = false;

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

    // Debug: battery status, always visible in the top left of the screen.
    this.batteryDebug = this.add
      .text(10, 10, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
      .setDepth(1003);

    // Set once the computer triggers the navigation screen, so the scene
    // transition is only queued once (reset on every scene start).
    this._leaving = false;

    // Set by the space bar or the controller's X button (consumed in update):
    // request a small jump.
    this.jumpRequested = false;
    this.padXWasDown = false;
    this.input.keyboard.on('keydown-SPACE', () => {
      this.jumpRequested = true;
    });

    this.cursors = this.input.keyboard.createCursorKeys();
  }

  update(time, delta) {
    const dt = delta / 1000;
    const p = this.player;

    // Input: keyboard (arrows) or an Xbox controller (D-pad moves, X jumps).
    const pad = this.input.gamepad ? this.input.gamepad.pad1 : null;
    const moveLeft = this.cursors.left.isDown || !!(pad && pad.left);
    const moveRight = this.cursors.right.isDown || !!(pad && pad.right);
    const moveUp = this.cursors.up.isDown || !!(pad && pad.up);
    const moveDown = this.cursors.down.isDown || !!(pad && pad.down);
    if (pad && pad.X && !this.padXWasDown) this.jumpRequested = true;
    this.padXWasDown = !!(pad && pad.X);

    // Walking (always possible).
    if (moveLeft) p.x -= MOVE_SPEED * dt;
    if (moveRight) p.x += MOVE_SPEED * dt;
    p.x = Phaser.Math.Clamp(p.x, p.displayWidth / 2, GAME_WIDTH - p.displayWidth / 2);

    const feet = () => p.y + p.displayHeight / 2;
    const onLadder = p.x >= LADDER.x && p.x <= LADDER.x + LADDER.width;
    const onFloor =
      Math.abs(feet() - FLOOR_TOP) < 2 || Math.abs(feet() - FLOOR_BOTTOM) < 2;

    if (onLadder && (moveUp || moveDown)) {
      // Climbing the ladder: no gravity while moving along it. The player may
      // climb as high as they want — even out of the top of the screen; the
      // lower end of the ladder is the bottom floor. Grabbing the ladder
      // cancels any ongoing jump.
      this.playerVy = 0;
      this.jumpInAir = false;
      if (moveUp) p.y -= CLIMB_SPEED * dt;
      else p.y += CLIMB_SPEED * dt;
      p.y = Phaser.Math.Clamp(
        p.y,
        -p.displayHeight / 2,
        FLOOR_BOTTOM - p.displayHeight / 2
      );
    } else if (onLadder && !onFloor && !this.jumpInAir) {
      // Hanging on the ladder between the floors (not while a jump is
      // airborne — then gravity rules).
      this.playerVy = 0;
    } else {
      // A space-bar press or X button while standing on a floor starts a
      // small jump.
      if (this.jumpRequested && onFloor) {
        this.playerVy = -JUMP_SPEED;
        this.jumpInAir = true;
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
        this.jumpInAir = false;
      } else if (feet() >= FLOOR_BOTTOM) {
        p.y = FLOOR_BOTTOM - p.displayHeight / 2;
        this.playerVy = 0;
        this.jumpInAir = false;
      }
    }

    // The jump request is consumed (or discarded) every frame.
    this.jumpRequested = false;

    // Advance the navigation simulation (the real-time ship position).
    updateNavSim(dt);
    // The battery always drains slowly; show it in the debug display.
    updatePowerSim(dt);
    this.batteryDebug.setText('Battery: ' + Math.round(powerSim.battery) + '%');

    // Taking a measurement: while the player is outside the top of the
    // screen (climbed up the ladder), the navigation display's measured
    // position is updated to the ship's current real position.
    if (feet() <= 0) {
      navSim.measuredX = navSim.shipX;
      navSim.measuredY = navSim.shipY;
    }

    // Sprite state: climbing (on the ladder, moving or hanging mid-air),
    // walking, or idle. Switch the animation only on state changes.
    const moving = moveUp || moveDown;
    const state =
      onLadder && (moving || !onFloor)
        ? 'climb'
        : moveLeft || moveRight
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
      p.setFlipX(moveLeft);
    } else if (state === 'climb' && moving) {
      // Flip the climbing frame back and forth while climbing.
      p.setFlipX(Math.floor(time / 250) % 2 === 0);
    }

    // Sync the debug overlay with the (measured) navigation display.
    syncNavShip(this.navShipDebug);

    // Minigame triggers: the computer opens the navigation screen, the bike
    // opens the electricity generator.
    const inComputer =
      p.x >= COMPUTER_ZONE.x &&
      p.x <= COMPUTER_ZONE.x + COMPUTER_ZONE.width &&
      p.y >= COMPUTER_ZONE.y &&
      p.y <= COMPUTER_ZONE.y + COMPUTER_ZONE.height;
    const inBike =
      p.x >= BIKE_ZONE.x &&
      p.x <= BIKE_ZONE.x + BIKE_ZONE.width &&
      p.y >= BIKE_ZONE.y &&
      p.y <= BIKE_ZONE.y + BIKE_ZONE.height;
    if (!this._leaving && (inComputer || inBike)) {
      this._leaving = true;
      playerReturnPos = {
        x: p.x,
        y: p.y,
        zone: inComputer ? COMPUTER_ZONE : BIKE_ZONE,
      };
      this.scene.start(inComputer ? 'navigationScreen' : 'electricityGenerator');
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
    // Advance the shared simulations and show the ship's state.
    updateNavSim(delta / 1000);
    updatePowerSim(delta / 1000);
    syncNavShip(this.ship);
  }
}

// --- Electricity generator scene ------------------------------------------------
// Pedal the bike to charge the ship's battery: alternate A/D or the left/right
// arrow keys. Each alternation generates power; the battery always drains
// slowly. For now the minigame just shows the battery level as a number.
// Esc returns to 'MainScene'.
class ElectricityGeneratorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'electricityGenerator' });
  }

  create() {
    this.cameras.main.setBackgroundColor('#101018');

    // The current battery power as a plain number (0-100%).
    this.batteryText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Pedaling: each time the pedal side changes, power is generated.
    this.lastPedalSide = null;
    const pedal = (side) => {
      if (this.lastPedalSide !== null && side !== this.lastPedalSide) {
        powerSim.battery = Math.min(BATTERY_MAX, powerSim.battery + PEDAL_BOOST * POWER_SPEED);
      }
      this.lastPedalSide = side;
    };
    this.input.keyboard.on('keydown-A', () => pedal('left'));
    this.input.keyboard.on('keydown-LEFT', () => pedal('left'));
    this.input.keyboard.on('keydown-D', () => pedal('right'));
    this.input.keyboard.on('keydown-RIGHT', () => pedal('right'));

    // Esc returns to the main ship screen.
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('MainScene');
    });
  }

  update(time, delta) {
    updatePowerSim(delta / 1000);
    this.batteryText.setText(Math.round(powerSim.battery) + '%');
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
  input: {
    gamepad: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [MainScene, NavigationScreenScene, ElectricityGeneratorScene],
};

const game = new Phaser.Game(config);

// Keep the movement keys for the game even when the canvas doesn't have
// browser focus (e.g. right after a page reload).
game.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE');
game.canvas.addEventListener('mousedown', () => game.canvas.focus());
