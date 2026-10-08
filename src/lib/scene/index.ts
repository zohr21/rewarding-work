/**
 * Scene catalogue. Each scene's shader is loaded only when it's chosen.
 * To add one: write src/lib/scene/scenes/<id>.ts, add the id to SCENES in
 * src/lib/storage.ts, and add an entry below (label + a CSS preview swatch).
 */
import type { SceneId } from '../storage';
import type { SceneDef } from './types';

export interface SceneInfo {
  label: string;
  /** CSS background used as the thumbnail in the Look menu. */
  preview: string;
  load: () => Promise<{ default: SceneDef }>;
}

export const SCENE_INFO: Record<SceneId, SceneInfo> = {
  lake: {
    label: 'Still lake',
    preview:
      'radial-gradient(circle at 70% 22%, #c7ebd1 0 7%, transparent 9%), linear-gradient(#050b0a 0%, #162a22 54%, #030907 56%, #0a1a14 100%)',
    load: () => import('./scenes/lake'),
  },
  ripples: {
    label: 'Rain ripples',
    preview:
      'radial-gradient(circle at 35% 62%, transparent 0 14%, #99e6bf66 15% 17%, transparent 18% 27%, #99e6bf33 28% 29%, transparent 30%), radial-gradient(circle at 76% 30%, transparent 0 8%, #99e6bf66 9% 11%, transparent 12%), linear-gradient(#0d1d17, #040b09)',
    load: () => import('./scenes/ripples'),
  },
  shallows: {
    label: 'Shallow water',
    preview:
      'radial-gradient(60% 40% at 30% 30%, #73d9ad77 0%, transparent 70%), radial-gradient(50% 35% at 75% 62%, #73d9ad55 0%, transparent 70%), linear-gradient(#0f2b22, #030907)',
    load: () => import('./scenes/shallows'),
  },
  aurora: {
    label: 'Aurora',
    preview:
      'radial-gradient(120% 70% at 30% 110%, #3fd9a0 0%, transparent 60%), radial-gradient(90% 60% at 80% 100%, #8a8cff 0%, transparent 65%), linear-gradient(#050816, #141b3d)',
    load: () => import('./scenes/aurora'),
  },
  lights: {
    label: 'Floating lights',
    preview:
      'radial-gradient(circle at 28% 62%, #ffc8a2 0 13%, transparent 15%), radial-gradient(circle at 70% 35%, #f7b3d6 0 10%, transparent 12%), radial-gradient(circle at 60% 78%, #ffe38a 0 6%, transparent 8%), linear-gradient(#fde6f0, #fff6ea)',
    load: () => import('./scenes/lights'),
  },
  water: {
    label: 'Calm water',
    preview:
      'radial-gradient(40% 18% at 58% 42%, #fff1c2 0%, transparent 70%), linear-gradient(#cfe2ff 0%, #fde6d6 44%, #b7d7e6 46%, #8fc3dc 100%)',
    load: () => import('./scenes/water'),
  },
  hills: {
    label: 'Rolling hills',
    preview:
      'radial-gradient(circle at 70% 28%, #ffffff 0 8%, transparent 10%), radial-gradient(120% 60% at 20% 100%, #b5dcaa 0 55%, transparent 57%), radial-gradient(120% 60% at 85% 95%, #d8ebd4 0 58%, transparent 60%), linear-gradient(#d4eaff, #fff0da)',
    load: () => import('./scenes/hills'),
  },
};

/** Quick capability check without keeping a context around. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
