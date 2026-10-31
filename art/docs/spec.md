# Virtual Office: Sprite and Tile Spec

The game files sit at the pack root: `tilesets/`, `maps/`, `sprites/`, `ui/`. Copy them as-is into `frontend/public/assets/` in the repo (served at URL path `assets/`, as used in the snippets below). Every path inside `.json` and `.tsx` files is relative, for example `../tilesets/office_props.png` from `maps/`.

## Global rules
- 32x32 tiles, margin 0, spacing 0, 8 columns per tileset. Integer zoom only. Phaser config: `pixelArt: true` (or `render: { pixelArt: true, roundPixels: true }`).
- PNGs are RGBA. Alpha is 0 or 255 only, and every colour comes from `docs/palette.hex`. Check this with `python3 tools/audit.py`.
- Rebuild everything with `python3 tools/build_art.py`.
- **Naming:** use `snake_case`. Tilesets are `office_<group>.png` + `.tsx`, avatars are `avatar_<variant>.png`, UI sheets are `ui/<name>.png`.

## Sheets
| file | size | frame | grid |
|---|---|---|---|
| tilesets/office_floor_walls.png | 256x96 | 32x32 | 8x3 (24 tiles) |
| tilesets/office_props.png | 256x192 | 32x32 | 8x6 (48 tiles) |
| sprites/avatar_v00..v29.png | 160x192 | 32x48 | 5 cols x 4 rows |
| ui/status_icons.png | 80x16 | 16x16 | 5x1 |

### office_floor_walls (firstgid 1)
| index | gid | name |
|---|---|---|
| 0 | 1 | wood |
| 1 | 2 | wood_alt |
| 2 | 3 | tile |
| 3 | 4 | tile_alt |
| 4 | 5 | carpet_a |
| 5 | 6 | carpet_b |
| 6 | 7 | carpet_c |
| 7 | 8 | carpet_d |
| 8 | 9 | carpet_e |
| 9 | 10 | carpet_lounge |
| 10 | 11 | door_threshold |
| 11 | 12 | collision |
| 12 | 13 | wall_top |
| 13 | 14 | wall_face |
| 14 | 15 | wall_face_window |
| 15 | 16 | wall_top_edge_s |
| 16 | 17 | wall_corner_nw |
| 17 | 18 | wall_corner_ne |
| 18 | 19 | wall_corner_sw |
| 19 | 20 | wall_corner_se |
| 20 | 21 | wall_top_edge_n |
| 21 | 22 | wall_top_edge_e |
| 22 | 23 | wall_top_edge_w |
| 23 | 24 | wall_face_shelf |

`collision` (index 11) is the fill tile for the hidden `collision` layer. It also has the tile property `collides=true`.

### office_props (firstgid 25)
| index | gid | name |
|---|---|---|
| 0 | 25 | desk_l |
| 1 | 26 | desk_r |
| 2 | 27 | monitor |
| 3 | 28 | laptop |
| 4 | 29 | chair_down |
| 5 | 30 | chair_up |
| 6 | 31 | chair_left |
| 7 | 32 | chair_right |
| 8 | 33 | plant_small |
| 9 | 34 | plant_tall_top |
| 10 | 35 | plant_tall_bottom |
| 11 | 36 | coffee_machine |
| 12 | 37 | water_cooler |
| 13 | 38 | bookshelf |
| 14 | 39 | standup_marker |
| 15 | 40 | floor_lamp |
| 16 | 41 | table_tl |
| 17 | 42 | table_tm |
| 18 | 43 | table_tr |
| 19 | 44 | table_bl |
| 20 | 45 | table_bm |
| 21 | 46 | table_br |
| 22 | 47 | whiteboard_l |
| 23 | 48 | whiteboard_r |
| 24 | 49 | sofa_l |
| 25 | 50 | sofa_m |
| 26 | 51 | sofa_r |
| 27 | 52 | coffee_table |
| 28 | 53 | sign_a |
| 29 | 54 | sign_b |
| 30 | 55 | sign_c |
| 31 | 56 | sign_d |
| 32 | 57 | sign_e |
| 33 | 58 | rug_tl |
| 34 | 59 | rug_tm |
| 35 | 60 | rug_tr |
| 36 | 61 | rug_ml |
| 37 | 62 | rug_mm |
| 38 | 63 | rug_mr |
| 39 | 64 | rug_bl |
| 40 | 65 | rug_bm |
| 41 | 66 | rug_br |
| 42 | 67 | sign_meeting |
| 43 | 68 | sign_lounge |
| 44 | 69 | sign_standup |
| 45 | 70 | wall_clock |
| 46 | 71 | box |
| 47 | 72 | blank |

**Multi-tile props:**
- `desk_l` + `desk_r` sit side by side, with the monitor on `desk_l` in `props_above`.
- The table is 3x2, laid out tl, tm, tr over bl, bm, br.
- The whiteboard is l + r.
- The sofa is l, m, r.
- The rug is 3x3 (placed on the `floor` layer).
- `standup_marker` (gid 39) sits on `props_below` as a 2x2 group at tiles (23–24, 15–16); it is walkable (no collision).
- `plant_tall_top` goes in `props_above`, one cell above `plant_tall_bottom`, so avatars walk behind it.

## Map: maps/office.json
- 48x30 tiles (1536x960 px), orthogonal, right-down render order, Tiled 1.10 JSON, tilesets embedded (image paths `../tilesets/*.png`).
- **Layers, in order:**
  - `floor` (includes the 3x3 rug)
  - `walls`
  - `props_below` (includes the standup marker)
  - `props_above` (render above avatars)
  - `collision` (tile layer, invisible; any non-zero gid blocks)
  - `zones` (object layer)
- **Zones:** rectangles with `type` set to squad, meeting, lounge, or standup, plus a string property `name`. Current zones: Squad A–E, Meeting 1, Meeting 2, Lounge, Standup.
- **To rename a squad:** change the object `name` and its `name` property. The sign tiles show only a letter.
- **Contents:**
  - 30 desks: Squads A, B, and C along the top, D and E at the bottom, 6 desks each in 2 rows of 3.
  - 2 meeting rooms at the bottom right, each with a 3x2 table, 8 chairs, and a whiteboard. Doors are at (35,20) and (43,20).
  - Lounge on the left (sofa, rug, coffee, water, books).
  - Standup in the centre (2x2 marker).

```ts
// preload
this.load.tilemapTiledJSON('office', 'assets/maps/office.json');
this.load.image('office_floor_walls', 'assets/tilesets/office_floor_walls.png');
this.load.image('office_props', 'assets/tilesets/office_props.png');
// create
const map = this.make.tilemap({ key: 'office' });
const ts = [map.addTilesetImage('office_floor_walls', 'office_floor_walls')!,
            map.addTilesetImage('office_props', 'office_props')!];
['floor','walls','props_below'].forEach(n => map.createLayer(n, ts, 0, 0));
const above = map.createLayer('props_above', ts, 0, 0)!.setDepth(10);
const col = map.createLayer('collision', ts, 0, 0)!.setVisible(false);
col.setCollisionByExclusion([-1, 0]);
this.physics.add.collider(player, col);
const zones = map.getObjectLayer('zones')!.objects; // o.type, o.name, o.x/y/width/height (px)
```

## Avatars: sprites/avatar_<variant>.png
- Frames are 32x48. Frame index = row*5 + col.
- **Rows:** 0 down, 1 left, 2 right, 3 up.
- **Columns:** 0 idle, 1–4 walk. The walk cycle is step, pass, other step, pass, with a 1 px bob on the pass frames.
- **Feet pivot (16,44):** use `setOrigin(0.5, 44/48)`. Depth-sort by y.
- Walk at 8 fps with repeat -1. Idle is a single frame.

```ts
VARIANTS.forEach(v => this.load.spritesheet(`avatar_${v}`, `assets/sprites/avatar_${v}.png`, { frameWidth: 32, frameHeight: 48 }));
const DIRS = ['down','left','right','up'];
function makeAnims(scene: Phaser.Scene, v: string) {
  DIRS.forEach((d, r) => {
    scene.anims.create({ key: `${v}_idle_${d}`, frames: [{ key: `avatar_${v}`, frame: r*5 }] });
    scene.anims.create({ key: `${v}_walk_${d}`, frames: scene.anims.generateFrameNumbers(`avatar_${v}`, { start: r*5+1, end: r*5+4 }), frameRate: 8, repeat: -1 });
  });
}
```

## Status icons: ui/status_icons.png
These are 16x16 frames: 0 online, 1 away, 2 focus, 3 talking, 4 knock. Load them with `this.load.spritesheet('status', 'assets/ui/status_icons.png', { frameWidth: 16, frameHeight: 16 })`, and place one above the head at (x, y - 46).

## Tiled import settings
New Tileset → Based on tileset image:
- Tile width/height 32, margin 0, spacing 0. **Embed in map** must be ON (Phaser needs embedded tilesets in the JSON).
- `.tsx` files are provided for editing; they hold the same tiles plus `name` properties. When you embed them, firstgid order must stay floor_walls=1, props=25.
- Map: Orthogonal, 32x32, CSV/array layer format (not base64/compressed), Fixed size.

## Adding an avatar variant
1. Add an entry to `variants()` in `tools/build_art.py`, or append to `sprites/variants.json`, choosing skin, hair, shirt, and pants **from palette names only**.
2. Avoid repeating a shirt+hair combo, and don't use the same colour for hair and shirt.
3. Run `python3 tools/build_art.py && python3 tools/audit.py`. Output must show 0 off-palette pixels.
4. Add the id to the `VARIANTS` list in code.
5. **For hand-drawn final art:** keep the 160x192 grid, the feet on y=44, and the row/column order above.

### Current variants
| id | skin | hair | shirt | pants |
|---|---|---|---|---|
| v00 | skin1 | shadow | sq_a | wood_dk |
| v01 | skin2 | wall_light | sq_b | sq_b_dk |
| v02 | skin3 | sq_a_dk | sq_c | metal |
| v03 | skin4 | hair_blond | sq_d | green_dk |
| v04 | skin1 | wood_md | sq_e | sq_e_dk |
| v05 | skin2 | hair_brown | green_md | shadow |
| v06 | skin3 | shadow | cream | wood_dk |
| v07 | skin4 | wall_light | metal | sq_b_dk |
| v08 | skin2 | hair_blond | sq_b_dk | green_dk |
| v09 | skin3 | wood_md | sq_c_dk | sq_e_dk |
| v10 | skin4 | hair_brown | sq_e_dk | shadow |
| v11 | skin1 | shadow | wood_lt | wood_dk |
| v12 | skin2 | shadow | sq_a | sq_b_dk |
| v13 | skin3 | wall_light | sq_b | metal |
| v14 | skin4 | sq_a_dk | sq_c | green_dk |
| v15 | skin1 | hair_blond | sq_d | sq_e_dk |
| v16 | skin2 | wood_md | sq_e | shadow |
| v17 | skin3 | hair_brown | green_md | wood_dk |
| v18 | skin4 | shadow | cream | sq_b_dk |
| v19 | skin1 | wall_light | metal | shadow |
| v20 | skin3 | hair_blond | sq_b_dk | sq_e_dk |
| v21 | skin4 | wood_md | sq_c_dk | shadow |
| v22 | skin1 | hair_brown | sq_e_dk | wood_dk |
| v23 | skin2 | shadow | wood_lt | sq_b_dk |
| v24 | skin3 | shadow | sq_a | metal |
| v25 | skin4 | wall_light | sq_b | green_dk |
| v26 | skin1 | sq_a_dk | sq_c | sq_e_dk |
| v27 | skin2 | hair_blond | sq_d | shadow |
| v28 | skin3 | wood_md | sq_e | wood_dk |
| v29 | skin4 | hair_brown | green_md | sq_b_dk |

## App icons, web icons, join splash, avatar picker (batch 2)
Built by `python3 tools/build_extras.py` (run it after `build_art.py`). It uses only the locked palette, with one exception listed below. The mark is a top-down room with a desk and a small avatar, drawn on a 16x16 grid and scaled up by whole numbers. Background is `sq_c` #4f9a8e. There's no text and no third-party branding.

| file | size | purpose | suggested repo location |
|---|---|---|---|
| teams/color.png | 192x192 | Teams `icons.color`. Full-bleed square, no rounded corners, no border. The mark is 96x96, centred (the 96 balance area, inside the 120x120 safe area). | Teams app package (next to manifest.json), **not** public/ |
| teams/outline.png | 32x32 | Teams `icons.outline`. **#FFFFFF on transparent.** | Teams app package |
| teams/color32x32.png | 32x32 | Optional `icons.color32x32` (full colour, transparent background, mark at 2x) | Teams app package |
| web/favicon.ico | 16, 32, 48 | Browser favicon (3 frames, each drawn at its own size from the 16 px grid) | frontend/public/ |
| web/favicon-16.png / favicon-32.png | 16x16 / 32x32 | PNG favicons | frontend/public/ |
| web/apple-touch-icon.png | 180x180 | iOS home screen icon (mark at 8x = 128, on a full background) | frontend/public/ |
| web/icon-192.png / icon-512.png | 192 / 512 | Web manifest icons. The mark is 50% / 62.5% of the edge, which fits the maskable safe zone. | frontend/public/ |
| web/site.webmanifest | – | Manifest snippet | frontend/public/ |
| web/join_splash.png | 320x180 | Join/loading illustration at 1x | frontend/public/assets/ui/ |
| web/join_splash@4x.png | 1280x720 | Same image, nearest-neighbour 4x | frontend/public/assets/ui/ |
| ui/avatar_picker.png | 480x560 | All 30 variants: idle facing down at 2x, with a v00–v29 label under each | frontend/public/assets/ui/ |
| ui/avatar_picker.json | – | Cell map for avatar_picker.png | frontend/public/assets/ui/ |

**Palette exception:** `teams/outline.png` is pure #FFFFFF on alpha 0, because the Teams manifest requires a white outline icon on a transparent background. `tools/audit.py` allows #FFFFFF for that file only. Every other file must use palette colours only.

**Teams manifest snippet:**
```json
"icons": { "color": "color.png", "outline": "outline.png", "color32x32": "color32x32.png" }
```

**HTML `<head>` tags:**
```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#4f9a8e">
```
`site.webmanifest` lists `/icon-192.png` and `/icon-512.png` (`purpose: "any maskable"`), with theme #4f9a8e and background #2b2135.

### Join splash safe area
The scene is built from the real tiles and avatars:
- Wall with windows across the top.
- Two desks with working avatars and a tall plant on the right.
- A lounge strip with a sofa, plants, and two chatting avatars along the bottom.

The open area is a calm cream tile floor with no props. Keep the title and Join button inside this area:
- **1x:** x 8–184, y 44–128 (176x84 px). The top-left corner is (8,44).
- **4x:** x 32–736, y 176–512 (704x336 px).

Render the text at integer scale over it. The image contains no text. For other aspect ratios, scale by a whole number, centre it, and letterbox with #2b2135.

### Avatar picker
- The grid is 6 columns x 5 rows, with each cell 80x112. Cell i sits at (i%6*80, floor(i/6)*112).
- Inside each cell, the sprite is at +8,+2 (64x96, frame 0 at 2x) and the label is at +34,+100 (pixel font, `outline` colour).
- `avatar_picker.json` gives the following for each cell:
  - `id`
  - `sheet` (for example `assets/sprites/avatar_v00.png`)
  - the cell's `x, y, w, h`
  - a `sprite` sub-rect
- A live picker could skip this image and render each `avatar_<id>` spritesheet directly (frame 0, or the walk-down anim on hover), which stays in sync automatically when variants are added. The image is a static fallback and preview.
