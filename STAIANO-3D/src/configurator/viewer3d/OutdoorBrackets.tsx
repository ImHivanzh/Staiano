"use client";

/** Illustrative L brackets underneath the saved unit envelope. */
export function OutdoorBrackets({
  widthM,
  heightM,
  depthM,
}: {
  widthM: number;
  heightM: number;
  depthM: number;
}) {
  return (
    <group name="Staffe a parete">
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * widthM * 0.32, -heightM / 2 - 0.02, 0]}
        >
          <mesh>
            <boxGeometry args={[0.045, 0.04, depthM + 0.1]} />
            <meshStandardMaterial
              color="#899ba2"
              metalness={0.75}
              roughness={0.35}
            />
          </mesh>
          <mesh position={[0, 0.15, -depthM / 2 - 0.04]}>
            <boxGeometry args={[0.045, 0.34, 0.04]} />
            <meshStandardMaterial
              color="#899ba2"
              metalness={0.75}
              roughness={0.35}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
