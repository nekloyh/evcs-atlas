import { AmbientLight, DirectionalLight, LightingEffect } from "@deck.gl/core";

/** One calibrated material/lighting contract for every analytical extrusion. */
export const EXTRUSION_MATERIAL: {
  ambient: number;
  diffuse: number;
  shininess: number;
  specularColor: [number, number, number];
} = {
  ambient: 0.7,
  diffuse: 0.55,
  shininess: 1,
  specularColor: [0, 0, 0],
};

function lighting(shadows: boolean): LightingEffect {
  const effect = new LightingEffect({
    ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.26 }),
    sun: new DirectionalLight({
      color: [255, 255, 255],
      intensity: 0.25,
      direction: [-0.45, 0.6, -1.15],
      _shadow: shadows,
    }),
  });
  if (shadows) effect.shadowColor = [0, 0, 0, 0.14];
  return effect;
}

/** Interleaved province overlay: same rig, no unreliable shadow pass. */
export const PROVINCE_LIGHTING = lighting(false);
/** Standalone national render: same rig with the approved light shadow. */
export const NATIONAL_LIGHTING = lighting(true);
