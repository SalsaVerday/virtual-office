import type { Direction } from '../types'

/** v00–v29. Add an id here when the art pack grows. See art/docs/spec.md. */
export const AVATAR_VARIANTS: readonly string[] = Array.from({ length: 30 }, (_, index) => {
  return `v${index.toString().padStart(2, '0')}`
})

export const FACING: readonly Direction[] = ['down', 'left', 'right', 'up']

export const AVATAR_ORIGIN_Y = 44 / 48

export function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function makeAnims(scene: Phaser.Scene, variants: readonly string[] = AVATAR_VARIANTS): void {
  for (const variant of variants) {
    FACING.forEach((dir, row) => {
      const idle = `${variant}_idle_${dir}`
      const walk = `${variant}_walk_${dir}`
      if (!scene.anims.exists(idle)) {
        scene.anims.create({
          key: idle,
          frames: [{ key: `avatar_${variant}`, frame: row * 5 }],
        })
      }
      if (!scene.anims.exists(walk)) {
        scene.anims.create({
          key: walk,
          frames: scene.anims.generateFrameNumbers(`avatar_${variant}`, {
            start: row * 5 + 1,
            end: row * 5 + 4,
          }),
          frameRate: 8,
          repeat: -1,
        })
      }
    })
  }
}

export function playAvatar(
  sprite: Phaser.GameObjects.Sprite,
  variant: string,
  dir: Direction,
  moving: boolean,
): void {
  const key = `${variant}_${moving ? 'walk' : 'idle'}_${dir}`
  if (sprite.anims.currentAnim?.key !== key) sprite.anims.play(key)
}

/** props_above sits at depth 10. Avatars stay in (5, 6) and still sort by feet y. */
export function avatarDepth(y: number): number {
  return 5 + y / 10_000
}

export function statusFrame(status: string, talking: boolean, knocking: boolean): number {
  if (knocking) return 4
  if (talking) return 3
  if (status === 'away') return 1
  if (status === 'focus') return 2
  return 0
}

export function makeNameTag(scene: Phaser.Scene, name: string): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, name, {
      fontFamily: 'ui-monospace, monospace',
      fontSize: '8px',
      color: '#f4ead6',
      backgroundColor: '#2b2135',
      padding: { x: 3, y: 1 },
    })
    .setOrigin(0.5, 1)
    .setResolution(1)
}
