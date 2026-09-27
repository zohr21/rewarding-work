/**
 * Shared GLSL (WebGL 1) for every scene: uniforms, noise helpers, and the main()
 * that calls the scene's `scene(uv, p, t)` and applies the page-wide effects.
 *
 *   uv  0..1 across the canvas
 *   p   aspect-corrected, centred horizontally: x in about -0.9..0.9, y in 0..1
 *   t   scene time in seconds (slows down during focus, frozen when motion is off)
 */

export const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;   // -1..1, smoothed
uniform float u_bloom;    // 1 right after a "celebrate", decays to 0
uniform float u_veil;     // 0..1 mix towards the page background (softer during focus)
uniform vec3 u_bg;        // page background colour
uniform float u_dark;     // 1 in dark theme
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_c4;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

const MAIN = `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = vec2((uv.x - 0.5) * u_res.x / u_res.y, uv.y);
  vec3 col = scene(uv, p, u_time);
  // Celebration: a soft warm lift from the bottom of the screen.
  col = mix(col, mix(u_c3, vec3(1.0), 0.35), u_bloom * 0.28 * (1.0 - uv.y * 0.7));
  col = mix(col, u_bg, u_veil);
  // Dither to hide banding in smooth gradients.
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function fragmentSource(sceneBody: string): string {
  return `${HEAD}\n${sceneBody}\n${MAIN}`;
}
