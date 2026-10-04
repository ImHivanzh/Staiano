"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import * as THREE from "three";

/** Metric ambient occlusion adds contact depth without remote assets or a new engine. */
export function SceneEffects({ enabled }: { enabled: boolean }) {
  const { gl, scene, camera, size, invalidate } = useThree();
  const composer = useRef<EffectComposer>(null);
  useEffect(() => {
    if (!enabled || size.width < 1 || size.height < 1) return;
    const renderer = new EffectComposer(gl);
    renderer.setPixelRatio(Math.min(1.5, gl.getPixelRatio()));
    renderer.setSize(size.width, size.height);
    const render = new RenderPass(scene, camera);
    const ao = new SSAOPass(scene, camera, size.width, size.height, 16);
    ao.kernelRadius = 0.24;
    ao.minDistance = 0.001;
    ao.maxDistance = 0.075;
    const output = new OutputPass();
    const antialias = new ShaderPass(FXAAShader);
    antialias.uniforms.resolution.value = new THREE.Vector2(
      1 / (size.width * Math.min(1.5, gl.getPixelRatio())),
      1 / (size.height * Math.min(1.5, gl.getPixelRatio())),
    );
    renderer.addPass(render);
    renderer.addPass(ao);
    renderer.addPass(output);
    renderer.addPass(antialias);
    composer.current = renderer;
    invalidate();
    return () => {
      composer.current = null;
      ao.dispose();
      output.dispose();
      antialias.dispose();
      renderer.dispose();
    };
  }, [gl, scene, camera, size.width, size.height, enabled, invalidate]);
  useFrame(({ gl, scene, camera }, delta) => {
    if (composer.current) composer.current.render(delta);
    else gl.render(scene, camera);
  }, 1);
  return null;
}
