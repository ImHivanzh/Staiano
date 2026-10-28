"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Colore dell'orizzonte: cielo, nebbia e bordo del terreno devono coincidere. */
export const HORIZON_COLOR = "#dde6ea";

/** Cielo a gradiente con un alone caldo dalla parte del sole: nessuna immagine remota. */
export function SkyDome({
  center,
  radius,
  sun,
}: {
  center: [number, number, number];
  radius: number;
  sun: [number, number, number];
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          horizon: { value: new THREE.Color(HORIZON_COLOR) },
          zenith: { value: new THREE.Color("#a9c6e2") },
          glow: { value: new THREE.Color("#fff1d2") },
          sun: { value: new THREE.Vector3(...sun).normalize() },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 horizon;
          uniform vec3 zenith;
          uniform vec3 glow;
          uniform vec3 sun;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 color = mix(horizon, zenith, pow(h, 0.55));
            float s = max(dot(normalize(vDir), sun), 0.0);
            color += glow * (pow(s, 6.0) * 0.16 + pow(s, 64.0) * 0.28);
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- il sole cambia solo con la scena
    [sun[0], sun[1], sun[2]],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      position={center}
      renderOrder={-10}
      material={material}
      frustumCulled={false}
    >
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}
