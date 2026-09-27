import type { SceneDef } from '../types';

/**
 * Rolling hills: five ridgelines at different depths drift past at different speeds
 * (near ones faster), with haze on the distant ones, a low sun and slow clouds.
 */
const hills: SceneDef = {
  palettes: {
    light: ['#fff0da', '#d4eaff', '#b5dcaa', '#d8ebd4'],
    dark: ['#2e2a4c', '#0b0e21', '#141a2b', '#2b3352'],
  },
  shader: `
vec3 scene(vec2 uv, vec2 p, float t) {
  vec3 col = mix(u_c1, u_c2, smoothstep(0.3, 1.0, uv.y));

  // Sun (moon in the dark theme) with a soft glow.
  float sd = length(p - vec2(0.35, 0.72) - u_pointer * 0.006);
  vec3 disc = mix(vec3(1.0, 0.97, 0.88), vec3(0.86, 0.88, 0.96), u_dark);
  col += disc * exp(-sd * 9.0) * (0.22 - 0.1 * u_dark);
  col = mix(col, disc, smoothstep(0.046, 0.041, sd) * (0.95 - 0.25 * u_dark));

  // Clouds.
  float cl = fbm(vec2(p.x * 1.4 + t * 0.008, p.y * 4.0));
  vec3 cloud = mix(vec3(1.0), u_c2 * 1.6, u_dark);
  col = mix(col, cloud, smoothstep(0.55, 0.8, cl) * smoothstep(0.45, 0.85, uv.y) * 0.45);

  float edge = 1.5 / u_res.y;
  for (int i = 0; i < 5; i++) {
    float k = float(i) / 4.0;               // 0 = far, 1 = near
    float x = p.x * (1.0 + k * 0.6) + t * (0.004 + k * k * 0.03)
            + u_pointer.x * 0.01 * (1.0 + k * 4.0) + float(i) * 11.0;
    float height = 0.52 - k * 0.1 + (fbm(vec2(x * (1.2 + k), float(i) * 3.7)) - 0.5) * (0.22 + k * 0.1);
    vec3 hc = mix(u_c4, u_c3, k);
    hc = mix(hc, u_c1, (1.0 - k) * 0.35);     // aerial perspective
    hc *= 0.95 + 0.25 * clamp(p.y - height + 0.15, 0.0, 0.3);
    col = mix(col, hc, smoothstep(height + edge, height - edge, p.y));
  }
  return col;
}
`,
};

export default hills;
