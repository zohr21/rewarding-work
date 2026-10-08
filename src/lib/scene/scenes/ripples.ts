import type { SceneDef } from '../types';

/**
 * Rain ripples: a pond seen from straight above. Drops land at random in a grid of
 * cells; each one sends out a ring that widens and fades. The summed height gives a
 * surface normal, which catches a soft light from the upper right.
 */
const ripples: SceneDef = {
  // [pond bed, lighter bed, highlight, pool of light]
  palettes: {
    light: ['#bcdcd8', '#e4f2ed', '#ffffff', '#fff3d9'],
    dark: ['#040b09', '#0d1d17', '#99e6bf', '#183226'],
  },
  shader: `
float ringField(vec2 q, float t) {
  float h = 0.0;
  vec2 ip = floor(q);
  vec2 fp = fract(q);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 id = ip + o;
      float r1 = hash(id);
      float r2 = hash(id + vec2(19.7, 3.1));
      float r3 = hash(id + vec2(5.3, 41.9));
      vec2 c = o + vec2(0.2 + 0.6 * r1, 0.2 + 0.6 * r3) - fp;
      float life = fract(t * (0.1 + 0.06 * r2) + r2 * 7.0);
      float d = length(c);
      float rad = life * 1.25;
      float env = smoothstep(0.22, 0.0, abs(d - rad)) * (1.0 - life) * (1.0 - life);
      h += sin((d - rad) * 42.0) * env;
    }
  }
  return h;
}

float pondH(vec2 q, float t) {
  return ringField(q * 2.2, t) + 0.6 * ringField(q * 3.7 + vec2(11.0, 4.0), t * 1.3)
       + 0.6 * fbm(q * 1.5 + vec2(t * 0.04, t * 0.03));
}

vec3 scene(vec2 uv, vec2 p, float t) {
  vec2 q = p + u_pointer * 0.01;
  float e = 0.004;
  float h0 = pondH(q, t);
  vec2 n = vec2(pondH(q + vec2(e, 0.0), t) - h0, pondH(q + vec2(0.0, e), t) - h0) / e * 0.012;
  vec3 N = normalize(vec3(-n, 1.0));

  vec3 base = mix(u_c1, u_c2, fbm(q * 1.6 + n * 0.03 + vec2(3.0, 8.0)));
  float pool = exp(-length(q - vec2(0.4, 0.8)) * 1.6);
  base = mix(base, u_c4, pool * 0.5);

  vec3 L = normalize(vec3(0.4, 0.5, 0.75));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  vec3 col = base * (0.78 + 0.34 * dot(N, L));
  col += u_c3 * pow(max(dot(N, H), 0.0), 70.0) * (0.1 + 0.55 * pool) * mix(0.6, 1.0, u_dark);
  return col;
}
`,
};

export default ripples;
