import type { SceneDef } from '../types';

/**
 * Calm water: a real 3D view over an endless sea. Each pixel's view ray hits the
 * water plane, the wave normal bends the reflection of the sky, and haze blends it
 * into the horizon. The camera glides forward very slowly. Sun by day, moon at night.
 */
const water: SceneDef = {
  palettes: {
    light: ['#fde6d6', '#cfe2ff', '#fff1c2', '#8fc3dc'],
    dark: ['#1d2748', '#060a17', '#e8eeff', '#0a1428'],
  },
  shader: `
float waveH(vec2 w, float t) {
  return noise(w * 0.7 + vec2(t * 0.15, t * 0.05))
       + 0.5 * noise(w * 1.9 - vec2(t * 0.22, -t * 0.1))
       + 0.25 * noise(w * 4.1 + vec2(0.0, t * 0.3));
}

vec3 sky(vec3 rd) {
  vec3 c = mix(u_c1, u_c2, pow(clamp(rd.y * 3.0, 0.0, 1.0), 0.6));
  vec3 sd = normalize(vec3(0.18, 0.1, 1.0));
  float s = max(dot(rd, sd), 0.0);
  c += u_c3 * (pow(s, 900.0) * 1.2 + pow(s, 14.0) * 0.22);
  return c;
}

vec3 scene(vec2 uv, vec2 p, float t) {
  vec2 sp = vec2(p.x, p.y - 0.6) + u_pointer * vec2(0.02, 0.01);
  vec3 ro = vec3(0.0, 1.0, t * 0.35);
  vec3 rd = normalize(vec3(sp.x, sp.y, 1.3));
  if (rd.y >= 0.0) return sky(rd);

  float d = -ro.y / rd.y;
  vec2 w = (ro + rd * d).xz;
  float e = 0.05;
  float amp = 0.35 / (1.0 + d * 0.06);   // calmer (and alias-free) towards the horizon
  float h0 = waveH(w, t);
  vec3 n = normalize(vec3((h0 - waveH(w + vec2(e, 0.0), t)) / e * amp, 1.0,
                          (h0 - waveH(w + vec2(0.0, e), t)) / e * amp));
  vec3 r = reflect(rd, n);
  r.y = abs(r.y);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  vec3 col = mix(u_c4, sky(r), fres);
  return mix(col, u_c1, 1.0 - exp(-d * 0.035));
}
`,
};

export default water;
