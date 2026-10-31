import Phaser from 'phaser'
import { qaHooksEnabled } from '../qa/enable'
import type { SceneApi } from '../qa/types'
import { MOVE_SPEED } from '../config'
import type { OfficeSession } from '../net/session'
import type { Direction } from '../types'
import { zonesFromTiled, type TiledZoneObject } from './zones'
import { findPath } from './pathfinding'
import { desiredVelocity, steerToward } from './movement'
import {
  AVATAR_ORIGIN_Y,
  AVATAR_VARIANTS,
  avatarDepth,
  hashString,
  makeAnims,
  makeNameTag,
  playAvatar,
  statusFrame,
} from './variants'

const TILE = 32

type Waypoint = { x: number; y: number }

export class OfficeScene extends Phaser.Scene {
  private session!: OfficeSession
  private player!: Phaser.Physics.Arcade.Sprite
  private label!: Phaser.GameObjects.Text
  private icon!: Phaser.GameObjects.Sprite
  private facing: Direction = 'down'
  private path: Waypoint[] | null = null
  private waypointKey = ''
  private waypointDist = Infinity
  private waypointSince = 0
  private blocked: boolean[][] = []
  private mapWidth = 48
  private mapHeight = 30
  private readonly remotes = new Map<string, RemoteAvatar>()
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys
  private loadErrors: string[] = []
  private alive = true

  constructor() {
    super('office')
  }

  init(data: { session: OfficeSession }): void {
    this.session = data.session
  }

  preload(): void {
    this.load.on('loaderror', (file: { key: string; src: string }) => {
      this.loadErrors.push(`${file.key} (${file.src})`)
    })
    this.load.tilemapTiledJSON('office', 'assets/maps/office.json')
    this.load.image('office_floor_walls', 'assets/tilesets/office_floor_walls.png')
    this.load.image('office_props', 'assets/tilesets/office_props.png')
    for (const variant of AVATAR_VARIANTS) {
      this.load.spritesheet(`avatar_${variant}`, `assets/sprites/avatar_${variant}.png`, {
        frameWidth: 32,
        frameHeight: 48,
      })
    }
    this.load.spritesheet('status', 'assets/ui/status_icons.png', {
      frameWidth: 16,
      frameHeight: 16,
    })
  }

  create(): void {
    if (this.loadErrors.length > 0) {
      throw new Error(`Art failed to load: ${this.loadErrors.join('; ')}`)
    }
    this.assertTextures()

    const map = this.make.tilemap({ key: 'office' })
    if (map.width !== 48 || map.height !== 30 || map.tileWidth !== 32 || map.tileHeight !== 32) {
      throw new Error(`office map is ${map.width}x${map.height} @ ${map.tileWidth}, expected 48x30 @ 32`)
    }
    this.mapWidth = map.width
    this.mapHeight = map.height

    // Phaser ignores image paths inside embedded tilesets. Keys must match the loaded textures.
    const floorTiles = map.addTilesetImage('office_floor_walls', 'office_floor_walls')
    const propTiles = map.addTilesetImage('office_props', 'office_props')
    if (!floorTiles || !propTiles) {
      throw new Error('addTilesetImage failed for office_floor_walls / office_props')
    }
    this.assertTileset(floorTiles, 'office_floor_walls', 256, 96)
    this.assertTileset(propTiles, 'office_props', 256, 192)
    const tilesets = [floorTiles, propTiles]

    for (const name of ['floor', 'walls', 'props_below'] as const) {
      const layer = map.createLayer(name, tilesets, 0, 0)
      if (!layer) throw new Error(`missing tile layer ${name}`)
      layer.setDepth(0)
    }
    const above = map.createLayer('props_above', tilesets, 0, 0)
    if (!above) throw new Error('missing tile layer props_above')
    above.setDepth(10)
    const collision = map.createLayer('collision', tilesets, 0, 0)
    if (!collision) throw new Error('missing tile layer collision')
    collision.setVisible(false)
    collision.setCollisionByExclusion([-1, 0])

    const zoneLayer = map.getObjectLayer('zones')
    if (!zoneLayer) throw new Error('missing object layer zones')
    const zones = zonesFromTiled(zoneLayer.objects as TiledZoneObject[])
    if (zones.length !== 9) throw new Error(`expected 9 zones, found ${zones.length}`)
    this.session.setZones(zones)

    this.blocked = []
    for (let y = 0; y < map.height; y += 1) {
      const row: boolean[] = []
      for (let x = 0; x < map.width; x += 1) {
        const tile = collision.getTileAt(x, y)
        row.push(Boolean(tile?.collides))
      }
      this.blocked.push(row)
    }

    makeAnims(this)
    const spawn = this.pickSpawn()
    this.player = this.physics.add.sprite(spawn.x, spawn.y, `avatar_${this.session.variant}`, 0)
    this.player.setOrigin(0.5, AVATAR_ORIGIN_Y)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setSize(16, 12, false)
    body.setOffset(8, 32)
    body.setCollideWorldBounds(true)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.physics.add.collider(this.player, collision)
    playAvatar(this.player, this.session.variant, 'down', false)

    this.label = makeNameTag(this, this.session.displayName)
    this.icon = this.add.sprite(spawn.x, spawn.y - 46, 'status', 0).setOrigin(0.5, 0.5)

    const camera = this.cameras.main
    camera.setZoom(2)
    camera.roundPixels = true
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    camera.startFollow(this.player, true, 0.2, 0.2)

    if (!this.input.keyboard) throw new Error('keyboard input is unavailable')
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as OfficeScene['wasd']
    this.arrows = this.input.keyboard.createCursorKeys()
    this.input.keyboard.addCapture(['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT'])

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return
      this.setPathTo(pointer.worldX, pointer.worldY)
    })

    this.game.canvas.dataset.testid = 'office-canvas'
    // Publish once before the loop starts so a paused map still tells the room where we are.
    this.session.updateFrame({
      x: this.player.x,
      y: this.player.y,
      dir: this.facing,
      moving: false,
      status: this.session.status,
      variant: this.session.variant,
    })
    this.installHooks()
  }

  shutdown(): void {
    this.alive = false
    if (import.meta.env.MODE === 'production') return
    delete window.__qa
  }

  update(time: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body
    let vx = 0
    let vy = 0
    let dir: Direction | null = null
    const axis = {
      x: (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0),
      y: (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0),
    }
    if (axis.x !== 0 || axis.y !== 0) {
      this.path = null
      const desired = desiredVelocity(axis, MOVE_SPEED)
      vx = desired.vx
      vy = desired.vy
      dir = desired.dir
    } else if (this.path && this.path.length > 0) {
      const target = this.path[0]
      const steer = steerToward(this.player, target, MOVE_SPEED, 6)
      const key = `${target.x},${target.y}`
      if (steer.arrived) {
        this.path.shift()
        this.waypointKey = ''
      } else {
        if (this.waypointKey !== key) {
          this.waypointKey = key
          this.waypointDist = steer.dist
          this.waypointSince = time
        } else if (steer.dist < this.waypointDist - 1) {
          this.waypointDist = steer.dist
          this.waypointSince = time
        } else if (time - this.waypointSince > 400) {
          this.path.shift()
          this.waypointKey = ''
        }
        vx = steer.vx
        vy = steer.vy
        dir = steer.dir
      }
    }
    body.setVelocity(vx, vy)
    if (dir) this.facing = dir
    const moving = Math.hypot(body.velocity.x, body.velocity.y) > 8
    playAvatar(this.player, this.session.variant, this.facing, moving)
    this.placeDecor(this.player, this.label, this.icon, this.session.status, this.session.localTalking, this.session.hasIncomingKnock)

    this.session.updateFrame({
      x: this.player.x,
      y: this.player.y,
      dir: this.facing,
      moving,
      status: this.session.status,
      variant: this.session.variant,
    })
    this.syncRemotes()
  }

  private sceneApi(): SceneApi {
    return {
      getPosition: () => ({ x: this.player.x, y: this.player.y }),
      teleport: (x: number, y: number) => this.teleport(x, y),
      worldToScreen: (x: number, y: number) => this.worldToScreen(x, y),
      setRunning: (running: boolean) => {
        if (running) this.game.loop.wake()
        else this.game.loop.sleep()
      },
    }
  }

  private teleport(x: number, y: number): void {
    this.path = null
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.reset(x, y)
    this.session.updateFrame({
      x: this.player.x,
      y: this.player.y,
      dir: this.facing,
      moving: false,
      status: this.session.status,
      variant: this.session.variant,
    })
  }

  private worldToScreen(x: number, y: number): { x: number; y: number } {
    const camera = this.cameras.main
    const view = camera.worldView
    const rect = this.game.canvas.getBoundingClientRect()
    const sx = view.width === 0 ? 0 : ((x - view.x) / view.width) * rect.width
    const sy = view.height === 0 ? 0 : ((y - view.y) / view.height) * rect.height
    return { x: rect.left + sx, y: rect.top + sy }
  }

  private installHooks(): void {
    // `vite build` (production mode) constant-folds this return and drops the chunk.
    if (import.meta.env.MODE === 'production') return
    if (!qaHooksEnabled()) return
    void import('../qa/install').then(({ installQaHooks }) => {
      if (!this.alive) return
      installQaHooks(this.session, this.sceneApi())
    })
  }

  private setPathTo(worldX: number, worldY: number): void {
    const start = {
      x: clamp(Math.floor(this.player.x / TILE), 0, this.mapWidth - 1),
      y: clamp(Math.floor(this.player.y / TILE), 0, this.mapHeight - 1),
    }
    const goal = {
      x: clamp(Math.floor(worldX / TILE), 0, this.mapWidth - 1),
      y: clamp(Math.floor(worldY / TILE), 0, this.mapHeight - 1),
    }
    const tiles = findPath((x, y) => this.blocked[y]?.[x] ?? true, start, goal, this.mapWidth, this.mapHeight)
    this.path = tiles.map((tile) => ({ x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE / 2 }))
    this.waypointKey = ''
  }

  private syncRemotes(): void {
    const seen = new Set<string>()
    const now = performance.now()
    for (const pose of this.session.getPoses()) {
      seen.add(pose.identity)
      let avatar = this.remotes.get(pose.identity)
      if (!avatar) {
        avatar = new RemoteAvatar(this, pose.name, pose.variant, pose.x, pose.y)
        this.remotes.set(pose.identity, avatar)
      }
      avatar.sync(pose, now)
    }
    for (const [identity, avatar] of this.remotes) {
      if (seen.has(identity)) continue
      avatar.destroy()
      this.remotes.delete(identity)
    }
  }

  private placeDecor(
    sprite: Phaser.GameObjects.Sprite,
    label: Phaser.GameObjects.Text,
    icon: Phaser.GameObjects.Sprite,
    status: string,
    talking: boolean,
    knocking: boolean,
  ): void {
    const depth = avatarDepth(sprite.y)
    sprite.setDepth(depth)
    label.setPosition(sprite.x, sprite.y - 58).setDepth(depth + 0.0002)
    icon.setPosition(sprite.x, sprite.y - 46).setDepth(depth + 0.0001)
    icon.setFrame(statusFrame(status, talking, knocking))
  }

  private pickSpawn(): { x: number; y: number } {
    const found: { x: number; y: number }[] = []
    const originX = 22
    const originY = 15
    for (let radius = 0; radius < 10 && found.length < 8; radius += 1) {
      for (let y = originY - radius; y <= originY + radius; y += 1) {
        for (let x = originX - radius; x <= originX + radius; x += 1) {
          if (Math.max(Math.abs(x - originX), Math.abs(y - originY)) !== radius) continue
          if (x <= 0 || y <= 0 || x >= this.mapWidth - 1 || y >= this.mapHeight - 1) continue
          if (this.blocked[y]?.[x]) continue
          found.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 })
        }
      }
    }
    if (found.length === 0) return { x: originX * TILE + TILE / 2, y: originY * TILE + TILE / 2 }
    return found[hashString(this.session.userId) % found.length]
  }

  private held(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    return this.wasd[direction].isDown || Boolean(this.arrows[direction]?.isDown)
  }

  private assertTextures(): void {
    const floor = this.textures.get('office_floor_walls').getSourceImage() as HTMLImageElement
    const props = this.textures.get('office_props').getSourceImage() as HTMLImageElement
    if (floor.width !== 256 || floor.height !== 96) {
      throw new Error(`office_floor_walls is ${floor.width}x${floor.height}, expected 256x96`)
    }
    if (props.width !== 256 || props.height !== 192) {
      throw new Error(`office_props is ${props.width}x${props.height}, expected 256x192`)
    }
    const avatar = this.textures.get('avatar_v00').get(0)
    if (avatar.width !== 32 || avatar.height !== 48) {
      throw new Error(`avatar frame is ${avatar.width}x${avatar.height}, expected 32x48`)
    }
    if (!this.textures.get('avatar_v00').has('19')) {
      throw new Error('avatar sheet is missing frame 19 (5 cols x 4 rows)')
    }
    const icon = this.textures.get('status').get(0)
    if (icon.width !== 16 || icon.height !== 16) {
      throw new Error(`status icon is ${icon.width}x${icon.height}, expected 16x16`)
    }
    if (!this.textures.get('status').has('4')) {
      throw new Error('status_icons is missing frame 4 (knock)')
    }
  }

  private assertTileset(
    tileset: Phaser.Tilemaps.Tileset,
    name: string,
    width: number,
    height: number,
  ): void {
    const texture = tileset.image as unknown as Phaser.Textures.Texture | HTMLImageElement | null
    const image =
      texture && 'getSourceImage' in texture
        ? (texture.getSourceImage() as HTMLImageElement)
        : (texture as HTMLImageElement | null)
    if (!image || image.width !== width || image.height !== height) {
      throw new Error(`${name} tileset image was not linked (${image?.width ?? 0}x${image?.height ?? 0})`)
    }
  }
}

class RemoteAvatar {
  private readonly sprite: Phaser.GameObjects.Sprite
  private readonly label: Phaser.GameObjects.Text
  private readonly icon: Phaser.GameObjects.Sprite
  private variant: string

  constructor(scene: Phaser.Scene, name: string, variant: string, x: number, y: number) {
    this.variant = variant
    this.sprite = scene.add.sprite(x, y, `avatar_${variant}`, 0).setOrigin(0.5, AVATAR_ORIGIN_Y)
    this.label = makeNameTag(scene, name)
    this.icon = scene.add.sprite(x, y - 46, 'status', 0).setOrigin(0.5, 0.5)
    playAvatar(this.sprite, variant, 'down', false)
  }

  sync(
    pose: {
      name: string
      variant: string
      x: number
      y: number
      dir: Direction
      moving: boolean
      status: string
      talking: boolean
      knockUntil: number
    },
    now: number,
  ): void {
    if (pose.variant !== this.variant) {
      this.variant = pose.variant
      this.sprite.setTexture(`avatar_${pose.variant}`)
    }
    if (this.label.text !== pose.name) this.label.setText(pose.name)
    const dx = pose.x - this.sprite.x
    const dy = pose.y - this.sprite.y
    const dist = Math.hypot(dx, dy)
    if (dist > 160 || dist < 0.5 || (!pose.moving && dist < 24)) {
      this.sprite.setPosition(pose.x, pose.y)
    } else {
      const step = Math.min(dist, Math.max(dist * 0.35, 4))
      this.sprite.x += (dx / dist) * step
      this.sprite.y += (dy / dist) * step
    }
    playAvatar(this.sprite, this.variant, pose.dir, pose.moving || dist > 2)
    const depth = avatarDepth(this.sprite.y)
    this.sprite.setDepth(depth)
    this.label.setPosition(this.sprite.x, this.sprite.y - 58).setDepth(depth + 0.0002)
    this.icon.setPosition(this.sprite.x, this.sprite.y - 46).setDepth(depth + 0.0001)
    this.icon.setFrame(statusFrame(pose.status, pose.talking, now < pose.knockUntil))
  }

  destroy(): void {
    this.sprite.destroy()
    this.label.destroy()
    this.icon.destroy()
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
