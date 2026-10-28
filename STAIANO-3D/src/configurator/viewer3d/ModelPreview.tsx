"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ModelAssetBoundary } from "./ModelAssetBoundary";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Scalda i vetri dei modelli (materiale «Vetro…») con una fiamma tremolante. */
function Model({ url, flame }: { url: string; flame: boolean }) {
  const gltf = useLoader(GLTFLoader, url);
  const invalidate = useThree((state) => state.invalidate);
  const [map, setMap] = useState<THREE.Texture | null>(null);
  const { scene, glass } = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const glass: THREE.MeshStandardMaterial[] = [];
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (mesh.isMesh && material && /vetro/i.test(material.name)) {
        mesh.material = material.clone();
        glass.push(mesh.material as THREE.MeshStandardMaterial);
      }
    });
    return { scene, glass };
  }, [gltf]);
  useEffect(() => {
    if (!flame || map) return;
    let live = true;
    new THREE.TextureLoader().load("/models/flame.png", (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false; // Match GLTFLoader's UV convention.
      if (live) setMap(texture);
    });
    return () => {
      live = false;
    };
  }, [flame, map]);
  useEffect(() => invalidate(), [flame, map, invalidate]);
  useFrame(({ gl, clock }) => {
    requestAnimationFrame(() => {
      gl.domElement.dataset.model = url;
    });
    const t = clock.elapsedTime;
    const k = flame
      ? 0.8 + 0.12 * Math.sin(t * 11) + 0.08 * Math.sin(t * 23 + 1)
      : 0;
    for (const material of glass) {
      const wanted = flame ? map : null;
      if (material.emissiveMap !== wanted) {
        // three.js materials are mutable by design
        // eslint-disable-next-line react-hooks/immutability
        material.emissiveMap = wanted;
        material.needsUpdate = true;
      }
      material.emissive.setRGB(k, k * 0.85, k * 0.6);
    }
    if (flame) invalidate();
  });
  return <primitive object={scene} dispose={null} />;
}

export default function ModelPreview({
  url,
  flame = false,
}: {
  url: string;
  flame?: boolean;
}) {
  return (
    <ModelAssetBoundary
      resetKey={url}
      fallback={
        <p role="alert">
          Anteprima non disponibile. Il file GLB resta scaricabile.
        </p>
      }
    >
      <div className="anteprima-modello" data-testid="model-preview">
        <Canvas
          frameloop="demand"
          camera={{ position: [2, 1, 3], fov: 40 }}
          fallback={
            <p>WebGL non disponibile. Scaricare il GLB per visualizzarlo.</p>
          }
        >
          <color attach="background" args={["#fafbfc"]} />
          <ambientLight intensity={1.7} />
          <directionalLight position={[4, 5, 3]} intensity={2.5} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.4}>
              <Model url={url} flame={flame} />
            </Bounds>
          </Suspense>
          <OrbitControls makeDefault minDistance={0.2} maxDistance={15} />
        </Canvas>
      </div>
    </ModelAssetBoundary>
  );
}
