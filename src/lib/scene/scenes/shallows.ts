import type { SceneDef } from '../types';

/**
 * Shallow water: the bed of a clear pool, tilted away from the viewer, with the web
 * of light that ripples focus onto it. Two warped ridge patterns slide across each
 * other; sampling them slightly apart per colour channel gives the soft fringes.
 */
const shallows: SceneDef = {
  // [deep, shallow, caustic light, rays]
  palettes: {
    light: ['#9fd4cf', '#dff3ec', '#ffffff', '#fff4d0'],
    dark: ['#030907', '#0f2b22', '#73d9ad', '#142d23'],
  },
  shader: `
float ridge(vec2 q) { return 1.0 - abs(noise(q) * 2.0 - 1.0); }

float caustic(vec2 q, float t) {
  vec2 w = vec2(fbm(q * 0.8 + vec2(0.0, t * 0.11)), fbm(q * 0.8 + vec2(5.2, -t * 0.09)));
  q += (w - 0.5) * 1.6;
  float a = ridge(q * 1.7 + vec2(t * 0.07, 0.0));
  float b = ridge(q * 2.6 - vec2(0.0, t * 0.06) + vec2(3.1));
  return pow(a, 5.0) * 0.7 + pow(b, 7.0) * 0.6 + pow(a * b, 3.0) * 0.8;
}

vec3 scene(vec2 uv, vec2 p, float t) {
  float k = 1.0 / (0.55 + uv.y * 0.9);
  vec2 q = vec2((p.x + u_pointer.x * 0.01) * k, k) * 4.0;

  vec3 col = mix(u_c1, u_c2, pow(uv.y, 1.3));
  vec3 c = vec3(caustic(q + vec2(0.02, 0.0), t), caustic(q, t), caustic(q - vec2(0.02, 0.0), t));
  col += u_c3 * c * mix(0.22, 0.4, u_dark) * (0.25 + 0.75 * uv.y);

  float ray = fbm(vec2(p.x * 3.0 + uv.y * 0.9 + t * 0.03, t * 0.05));
  col += u_c4 * pow(ray, 3.0) * smoothstep(0.1, 1.0, uv.y) * mix(0.25, 1.0, u_dark);
  return col;
}
`,
};

export default shallows;
