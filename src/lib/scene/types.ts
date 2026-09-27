/**
 * A background scene is one fragment shader drawn over the whole viewport.
 * Everything is procedural (no textures or models), so a scene is a few KB,
 * looks sharp at any size and works offline.
 */

/** Four colours as hex: [horizon / low sky, high sky, accent A, accent B]. */
export type Palette = readonly [string, string, string, string];

export interface SceneDef {
  /** GLSL body: must define `vec3 scene(vec2 uv, vec2 p, float t)` (see prelude.ts). */
  shader: string;
  palettes: { light: Palette; dark: Palette };
}
