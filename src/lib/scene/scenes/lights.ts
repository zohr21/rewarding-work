import type { SceneDef } from '../types';

/**
 * Floating lights: soft bokeh discs in four depth layers that drift upwards.
 * Near layers are bigger, faster and follow the pointer more (parallax).
 * In the dark theme they glow like fireflies.
 */
const lights: SceneDef = {
  palettes: {
    light: ['#fff6ea', '#fde6f0', '#ffc8a2', '#f7b3d6'],
    dark: ['#0f1f22', '#060d10', '#ffe38a', '#c4f27a'],
  },
  shader: `
vec3 scene(vec2 uv, vec2 p, float t) {
  vec3 col = mix(u_c1, u_c2, smoothstep(0.0, 1.0, uv.y + 0.15 * (fbm(p * 1.5 + t * 0.01) - 0.5)));

  for (int L = 3; L >= 0; L--) {
    float fl = float(L);
    float z = 1.0 + fl * 0.8;            // 1 = near, 3.4 = far
    vec2 q = p * (3.0 * z) + u_pointer * (0.6 / z) + vec2(fl * 17.3, fl * 5.1);
    q.y -= t * 0.09 / sqrt(z);
    q.x += sin(t * 0.05 + fl) * 0.3;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash(id + fl * 7.3);
    if (h > 0.62 + fl * 0.09) {          // sparser in the distance, where cells are smaller
      vec2 o = (vec2(hash(id + 1.3), hash(id + 2.1)) - 0.5) * 0.3;
      o += 0.1 * vec2(sin(t * 0.3 + h * 20.0), cos(t * 0.25 + h * 13.0));
      float r = length(f - o);
      float size = 0.1 + 0.12 * hash(id + 5.0);
      float soft = size * (0.85 - fl * 0.18);   // near discs are the most out of focus
      float disc = 1.0 - smoothstep(size - soft, size, r);
      float halo = exp(-r * r / (size * size) * 1.5) * u_dark;
      float tw = 0.65 + 0.35 * sin(t * (0.4 + h) + h * 30.0);
      vec3 c = mix(u_c3, u_c4, hash(id + 9.0));
      col = mix(col, c, clamp((disc * 0.8 + halo * 0.35) * tw * (0.85 / z), 0.0, 1.0));
    }
  }
  return col;
}
`,
};

export default lights;
