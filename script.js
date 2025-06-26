let WIDTH = 800;
let HEIGHT = 800;

class MazeScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MazeScene' });
    }

    preload() {
        this.load.image("tree", "assets/tree.png");
        this.load.image("bonnie", "assets/bonnie.png");
        this.load.image("jumpscare", "assets/jumpscare.png");
        this.load.image("man", "assets/man.png");
        this.load.image("attack", "assets/attack.png"); // Preload attack powerup image
    }

    create() {
        // Background: dark green
        this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x113322);

        // Maze generation
        this.tileSize = 64;
        this.rows = Math.floor(HEIGHT / this.tileSize);
        this.cols = Math.floor(WIDTH / this.tileSize);
        this.maze = [];
        this.treeGroup = this.physics.add.staticGroup();

        // Generate maze: 0 = empty, 1 = wall
        for (let y = 0; y < this.rows; y++) {
            this.maze[y] = [];
            for (let x = 0; x < this.cols; x++) {
                // Border walls
                if (x === 0 || y === 0 || x === this.cols - 1 || y === this.rows - 1) {
                    // Create a gap at the right side for exit
                    if (
                        x === this.cols - 1 &&
                        y === Math.floor(this.rows / 2)
                    ) {
                        this.maze[y][x] = 0; // gap for exit
                    } else {
                        this.maze[y][x] = 1;
                    }
                } else if (x === this.cols - 2 && y === Math.floor(this.rows / 2)) {
                    // Exit cell (leave open)
                    this.maze[y][x] = 0;
                } else if (Math.random() < 0.22) {
                    this.maze[y][x] = 1;
                } else {
                    this.maze[y][x] = 0;
                }
            }
        }
        // Ensure start and exit are open
        let startY = Math.floor(this.rows / 2);
        this.maze[startY][1] = 0;
        this.maze[startY][this.cols - 2] = 0;
        this.maze[startY][this.cols - 1] = 0; // Ensure gap at right border

        // Draw maze
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.maze[y][x] === 1) {
                    this.treeGroup.create(
                        x * this.tileSize + this.tileSize / 2,
                        y * this.tileSize + this.tileSize / 2,
                        "tree"
                    )
                        .setDisplaySize(this.tileSize, this.tileSize)
                        .refreshBody();
                }
            }
        }

        // Man (player) at the left inside the maze, smaller size
        this.man = this.physics.add.sprite(
            this.tileSize + this.tileSize / 2,
            startY * this.tileSize + this.tileSize / 2,
            "man"
        );
        this.man.setDisplaySize(this.tileSize * 0.6, this.tileSize * 0.6);
        this.man.setCollideWorldBounds(true);

        // Input
        this.cursors = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        // Collisions
        this.physics.add.collider(this.man, this.treeGroup);

        // Bonnie (chaser)
        this.bonnie = null;
        this.bonnieSpawned = false;
        this.moveTime = 0;
        this.manMoving = false;

        // Attack powerup
        this.hasAttack = false;
        // Spawn attack.png at a random open cell
        let ax, ay;
        do {
            ay = Phaser.Math.Between(1, this.rows - 2);
            ax = Phaser.Math.Between(1, this.cols - 2);
        } while (this.maze[ay][ax] === 1 || (ax === 1 && ay === startY));
        this.attack = this.physics.add.sprite(
            ax * this.tileSize + this.tileSize / 2,
            ay * this.tileSize + this.tileSize / 2,
            "attack"
        );
        this.attack.setDisplaySize(this.tileSize * 0.7, this.tileSize * 0.7);

        // Overlap for attack pickup
        this.physics.add.overlap(this.man, this.attack, () => {
            this.hasAttack = true;
            this.attack.destroy();

            // After picking up attack, make bonnie run to the nearest wall and slow down
            if (this.bonnie) {
                // Find the nearest wall (corner) from bonnie's current position
                let corners = [
                    { x: this.tileSize / 2, y: this.tileSize / 2 }, // top-left
                    { x: (this.cols - 1) * this.tileSize + this.tileSize / 2, y: this.tileSize / 2 }, // top-right
                    { x: this.tileSize / 2, y: (this.rows - 1) * this.tileSize + this.tileSize / 2 }, // bottom-left
                    { x: (this.cols - 1) * this.tileSize + this.tileSize / 2, y: (this.rows - 1) * this.tileSize + this.tileSize / 2 } // bottom-right
                ];
                let minDist = Infinity;
                let target = corners[0];
                for (let c of corners) {
                    let dist = Phaser.Math.Distance.Between(this.bonnie.x, this.bonnie.y, c.x, c.y);
                    if (dist < minDist) {
                        minDist = dist;
                        target = c;
                    }
                }
                this.bonnieFleeTarget = target;
                this.bonnieFleeing = true;

                // Enable collision with outer walls for bonnie
                // Remove any previous collider to avoid duplicates
                if (this.bonnieWallCollider) {
                    this.bonnieWallCollider.destroy();
                }
                this.bonnieWallCollider = this.physics.add.collider(this.bonnie, this.treeGroup);
            }
        });

        // Track if game ended
        this.ended = false;
    }

    update(time, delta) {
        if (this.ended) return;

        let speed = 120; // Fast speed for man
        let bonnieSpeed = 60; // Normal bonnie speed
        let bonnieFleeSpeed = 20; // Significantly slower when fleeing
        let moved = false;
        let vx = 0, vy = 0;

        if (this.cursors.left.isDown) {
            vx = -speed;
            moved = true;
            this.man.setFlipX(true);
        } else if (this.cursors.right.isDown) {
            vx = speed;
            moved = true;
            this.man.setFlipX(false);
        } else if (this.cursors.up.isDown) {
            vy = -speed;
            moved = true;
        } else if (this.cursors.down.isDown) {
            vy = speed;
            moved = true;
        }

        if (moved) {
            this.man.setVelocity(vx, vy);
            this.manMoving = true;
        } else {
            this.man.setVelocity(0, 0);
        }

        // Track movement time for Bonnie spawn
        if (this.manMoving && !this.bonnieSpawned) {
            this.moveTime += delta;
            if (this.moveTime >= 2000) {
                // Spawn Bonnie at random open cell
                let by, bx;
                do {
                    by = Phaser.Math.Between(1, this.rows - 2);
                    bx = Phaser.Math.Between(1, this.cols - 2);
                } while (
                    this.maze[by][bx] === 1 ||
                    (bx === 1 && by === Math.floor(this.rows / 2))
                );
                this.bonnie = this.physics.add.sprite(
                    bx * this.tileSize + this.tileSize / 2,
                    by * this.tileSize + this.tileSize / 2,
                    "bonnie"
                );
                this.bonnie.setDisplaySize(this.tileSize * 1.7, this.tileSize * 1.7); // Make bonnie.png bigger
                // Bonnie does NOT collide with treeGroup (can phase through)
                this.bonnieSpawned = true;
                this.bonnieFleeing = false;
                this.bonnieFleeTarget = null;
            }
        }

        // Bonnie follows man or flees to furthest wall
        if (this.bonnie) {
            if (this.hasAttack && this.bonnieFleeing && this.bonnieFleeTarget) {
                // Bonnie flees to furthest wall at slow speed
                let dx = this.bonnieFleeTarget.x - this.bonnie.x;
                let dy = this.bonnieFleeTarget.y - this.bonnie.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 2) {
                    let angle = Math.atan2(dy, dx);
                    let bx = Math.cos(angle) * bonnieFleeSpeed;
                    let by = Math.sin(angle) * bonnieFleeSpeed;
                    this.bonnie.setVelocity(bx, by);
                } else {
                    this.bonnie.setVelocity(0, 0);
                }
            } else if (!this.hasAttack) {
                // Bonnie chases man at normal speed
                let dx = this.man.x - this.bonnie.x;
                let dy = this.man.y - this.bonnie.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 2) {
                    let angle = Math.atan2(dy, dx);
                    let bx = Math.cos(angle) * bonnieSpeed;
                    let by = Math.sin(angle) * bonnieSpeed;
                    this.bonnie.setVelocity(bx, by);
                } else {
                    this.bonnie.setVelocity(0, 0);
                }
            }
        }

        // If man has attack, allow him to "defeat" bonnie by colliding
        if (this.bonnie && this.hasAttack) {
            if (
                Phaser.Geom.Intersects.RectangleToRectangle(
                    this.man.getBounds(),
                    this.bonnie.getBounds()
                )
            ) {
                this.ended = true;
                // Win by defeating bonnie
                this.scene.start('DefeatBonnieScene');
                return;
            }
        }

        // If man does not have attack, bonnie jumpscare on collision
        if (this.bonnie && !this.hasAttack) {
            if (
                Phaser.Geom.Intersects.RectangleToRectangle(
                    this.man.getBounds(),
                    this.bonnie.getBounds()
                )
            ) {
                this.ended = true;
                this.scene.start('JumpscareScene');
                return;
            }
        }

        // Check for win (man at exit, only if not fighting bonnie)
        let exitX = (this.cols - 1) * this.tileSize + this.tileSize / 2;
        let exitY = Math.floor(this.rows / 2) * this.tileSize + this.tileSize / 2;
        if (
            Math.abs(this.man.x - exitX) < this.tileSize / 2 &&
            Math.abs(this.man.y - exitY) < this.tileSize / 2 &&
            !this.hasAttack
        ) {
            this.ended = true;
            this.scene.start('WinScene');
        }
    }
}

// Add this new scene for defeating bonnie
class DefeatBonnieScene extends Phaser.Scene {
    constructor() {
        super({ key: 'DefeatBonnieScene' });
    }
    create() {
        this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000);
        this.add.text(WIDTH / 2, HEIGHT / 2, "YOU WIN", {
            fontSize: "80px",
            fill: "#ffffff",
            fontStyle: "bold"
        }).setOrigin(0.5);
    }
}

class WinScene extends Phaser.Scene {
    constructor() {
        super({ key: 'WinScene' });
    }
    create() {
        this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0xffffff);
        this.add.text(WIDTH / 2, HEIGHT / 2, "YOU WIN", {
            fontSize: "80px",
            fill: "#00cc00",
            fontStyle: "bold"
        }).setOrigin(0.5);
    }
}

class JumpscareScene extends Phaser.Scene {
    constructor() {
        super({ key: 'JumpscareScene' });
    }
    create() {
        this.add.image(WIDTH / 2, HEIGHT / 2, "jumpscare").setDisplaySize(WIDTH, HEIGHT);
    }
}

const config = {
    type: Phaser.AUTO,
    width: WIDTH,
    height: HEIGHT,
    scene: [MazeScene, WinScene, JumpscareScene, DefeatBonnieScene],
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    title: "Maze Man Game"
};

const game = new Phaser.Game(config);
