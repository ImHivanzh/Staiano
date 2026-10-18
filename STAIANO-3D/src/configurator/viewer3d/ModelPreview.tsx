"use client";
import { Component, Suspense, useMemo } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

class AssetError extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert">
        Anteprima non disponibile. Il file GLB resta scaricabile.
      </p>
    ) : (
      this.props.children
    );
  }
}

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
    <AssetError key={url}>
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
    </AssetError>
  );
}
