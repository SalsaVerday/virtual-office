import Phaser from 'phaser'
import type { OfficeSession } from '../net/session'
import { OfficeScene } from './OfficeScene'

export function mountOffice(parent: HTMLElement, session: OfficeSession): Phaser.Game {
  const width = Math.max(parent.clientWidth, 320)
  const height = Math.max(parent.clientHeight, 240)
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#2b2135',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    banner: false,
    audio: { noAudio: true },
    fps: { target: 60, forceSetTimeOut: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width,
      height,
      zoom: 1,
      autoRound: true,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    render: {
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      antialiasGL: false,
    },
    scene: [],
  })
  game.scene.add('office', OfficeScene, true, { session })
  return game
}
