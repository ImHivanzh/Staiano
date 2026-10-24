"use client";
import { Suspense, useMemo } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { ModelAssetBoundary } from "./ModelAssetBoundary";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function Model({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  useFrame(({ gl }) => {
    requestAnimationFrame(() => {
      gl.domElement.dataset.model = url;
    });
  });
  return <primitive object={scene} dispose={null} />;
}

export default function ModelPreview({ url }: { url: string }) {
  return (
    <ModelAssetBoundary
      key={url}
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
              <Model url={url} />
            </Bounds>
          </Suspense>
          <OrbitControls makeDefault minDistance={0.2} maxDistance={15} />
        </Canvas>
      </div>
    </ModelAssetBoundary>
  );
}
