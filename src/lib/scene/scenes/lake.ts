import type { SceneDef } from '../types';

/**
 * Still lake: a far shore of conifers under a moon (sun by day), mirrored in water
 * that stretches towards the viewer. The wave slope bends the mirrored sky, more so
 * up close, and a column of glitter runs under the moon. Stars in the dark theme.
 */
const lake: SceneDef = {
  // [horizon, high sky, moon / sun, deep water]
  palettes: {
    light: ['#fde9d6', '#cfe2f5', '#fff4d2', '#86b9c9'],
    dark: ['#162a22', '#050b0a', '#c7ebd1', '#030907'],
  },
  shader: `
const float HZ = 0.56;
const vec2 MOON = vec2(0.42, 0.84);

vec3 lakeSky(vec2 q) {
  float y = clamp((q.y - HZ) / (1.0 - HZ), 0.0, 1.0);
  vec3 c = mix(u_c1, u_c2, pow(y, 0.7));

  float d = length(q - MOON);
  c += u_c3 * exp(-d * 7.0) * (0.14 + 0.06 * u_dark);
  c = mix(c, u_c3, smoothstep(0.036, 0.031, d) * 0.92);

  vec2 g = q * 90.0;
  float st = step(0.986, hash(floor(g))) * smoothstep(0.35, 0.0, length(fract(g) - 0.5));
  c += st * y * 0.7 * u_dark * vec3(0.8, 0.95, 0.9);

  // Far shore: a low ridge with one conifer tip per cell.
  float tip = 1.0 - 2.0 * abs(fract(q.x * 34.0) - 0.5);
  float th = 0.022 + 0.05 * fbm(vec2(q.x * 1.8, 3.0))
           + 0.03 * tip * (0.4 + 0.6 * hash(vec2(floor(q.x * 34.0), 7.0)));
  vec3 shore = mix(u_c4, u_c1, 0.25) * mix(0.75, 0.7, u_dark);
  c = mix(c, shore, smoothstep(th + 0.002, th - 0.002, q.y - HZ));

  // Mist along the waterline.
  return mix(c, u_c1, exp(-abs(q.y - HZ) * 30.0) * 0.35);
}

float lakeWave(vec2 w, float t) {
  return fbm(w * 1.3 + vec2(t * 0.05, t * 0.09)) + 0.5 * fbm(w * 3.1 - vec2(t * 0.07, t * 0.04));
}

vec3 scene(vec2 uv, vec2 p, float t) {
  p.x += u_pointer.x * 0.01;
  if (p.y > HZ) return lakeSky(p);

  float dy = HZ - p.y;
  float z = 0.12 / (dy + 0.004);
  vec2 w = vec2(p.x * z, z) * 14.0;
  float e = 0.05;
  float h0 = lakeWave(w, t);
  vec2 n = vec2(lakeWave(w + vec2(e, 0.0), t) - h0, lakeWave(w + vec2(0.0, e), t) - h0) / e;

  // Flat (and alias-free) at the horizon, livelier towards the viewer.
  float amp = (0.006 + 0.05 * dy) * smoothstep(0.0, 0.05, dy);
  vec2 r = vec2(p.x + n.x * amp * 0.6, clamp(HZ + dy + n.y * amp, HZ + 0.001, 0.999));
  vec3 col = lakeSky(r);
  col = mix(col, u_c4, 0.12 + 0.5 * smoothstep(0.05, 0.6, dy));

  float gx = (p.x - MOON.x + n.x * 0.02) / (0.02 + dy * 0.3);
  float glitter = exp(-gx * gx) * smoothstep(0.0, 0.5, n.y + 0.1);
  col += u_c3 * glitter * (0.12 + 0.2 * u_dark) * smoothstep(0.0, 0.04, dy);
  return col;
}
`,
};

export default lake;
