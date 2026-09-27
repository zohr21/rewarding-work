import type { SceneDef } from '../types';

/** Curtains of northern light in four depth layers; stars in the dark theme. */
const aurora: SceneDef = {
  palettes: {
    light: ['#fdf1f6', '#d9e8ff', '#9fe8c8', '#c7b8ff'],
    dark: ['#141b3d', '#050816', '#3fd9a0', '#8a8cff'],
  },
  shader: `
vec3 scene(vec2 uv, vec2 p, float t) {
  p += u_pointer * vec2(0.03, 0.015);
  vec3 col = mix(u_c1, u_c2, smoothstep(0.0, 1.0, uv.y));

  // Stars (dark theme only), fading out towards the horizon.
  vec2 g = p * 150.0;
  float s = hash(floor(g));
  float star = smoothstep(0.997, 1.0, s) * smoothstep(0.45, 0.1, length(fract(g) - 0.5));
  col += vec3(star * (0.6 + 0.4 * sin(t * 1.3 + s * 90.0))) * u_dark * smoothstep(0.25, 0.9, uv.y);

  // Far layers first; each one is a wavy lower edge that glows upwards, with vertical rays.
  for (int i = 3; i >= 0; i--) {
    float fi = float(i);
    float z = 1.0 + fi * 0.7;
    float x = p.x / z * 1.3 + fi * 3.1;
    float w = fbm(vec2(x * 1.4 + t * 0.025 * (1.0 + fi * 0.3), t * 0.018 + fi * 5.0));
    float edge = 0.4 + fi * 0.08 + (w - 0.5) * 0.45;
    float d = p.y - edge;
    float band = smoothstep(-0.01, 0.03, d) * exp(-max(d, 0.0) * (3.0 + fi * 1.5));
    float rays = 0.55 + 0.45 * noise(vec2(x * 22.0, t * 0.12 + fi * 7.0));
    vec3 c = mix(u_c3, u_c4, clamp(fi / 3.0 + (w - 0.5), 0.0, 1.0));
    col = mix(col, c, clamp(band * rays * (0.9 / z), 0.0, 1.0));
  }
  return col;
}
`,
};

export default aurora;
