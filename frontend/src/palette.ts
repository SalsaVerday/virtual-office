/** Locked palette from the art pack. Shirt names in variants.json map to these. */
export const PALETTE: Record<string, string> = {
  outline: '#2b2135',
  shadow: '#4a3f55',
  wall_face: '#7d6b78',
  wall_light: '#b3a1a3',
  wall_top: '#e0d2c0',
  wood_dk: '#7a4e34',
  wood_md: '#a8704a',
  wood_lt: '#c99466',
  tile_md: '#b8a88f',
  tile_lt: '#dccdb4',
  cream: '#f4ead6',
  green_dk: '#3f6b4a',
  green_md: '#6b9a5c',
  green_lt: '#a3c47f',
  sq_a: '#b8574c',
  sq_b: '#4f7aa3',
  sq_c: '#4f9a8e',
  sq_d: '#d4a24c',
  sq_e: '#8a5a8f',
  sq_a_dk: '#8c3f3a',
  sq_b_dk: '#3a5a7c',
  sq_c_dk: '#3a7268',
  sq_d_dk: '#a87b34',
  sq_e_dk: '#66406b',
  skin1: '#f1c7a1',
  skin2: '#d39b75',
  skin3: '#a0694a',
  skin4: '#6a4532',
  hair_brown: '#5e3f2a',
  hair_blond: '#d9b56a',
  screen: '#9fd0cc',
  metal: '#8e8a96',
}

export function paletteHex(name: string): string {
  return PALETTE[name] ?? PALETTE.metal
}
