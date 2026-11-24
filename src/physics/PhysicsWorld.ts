import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { StaticBoxCollider } from '../world/RoadsideProps';

/**
 * Manages the Rapier3D physics simulation world and static environment colliders.
 * Tracks static environment bodies separately so switching maps at runtime cleanly
 * replaces world colliders without disturbing the player vehicle rigid body.
 */
export class PhysicsWorld {
  public world!: RAPIER.World;
  private initialized = false;
  private staticBodies: RAPIER.RigidBody[] = [];

  public async init(): Promise<void> {
    if (this.initialized) return;
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
    this.world.timestep = 1 / 60;
    this.initialized = true;
  }

  public clearStaticEnvironment(): void {
    if (!this.initialized) return;
    for (const body of this.staticBodies) {
      this.world.removeRigidBody(body);
    }
    this.staticBodies = [];
  }

  public addStaticTrimesh(
    vertices: Float32Array,
    indices: Uint32Array,
    friction = 1.0,
    restitution = 0.0
  ): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(bodyDesc);
    this.staticBodies.push(body);
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(friction)
      .setRestitution(restitution);
    return this.world.createCollider(colliderDesc, body);
  }

  public addStaticBoxes(boxes: StaticBoxCollider[]): void {
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    for (const box of boxes) {
      q.setFromAxisAngle(up, box.rotationY);
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(box.position.x, box.position.y, box.position.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      const body = this.world.createRigidBody(bodyDesc);
      this.staticBodies.push(body);
      const colDesc = RAPIER.ColliderDesc.cuboid(
        box.halfExtents.x,
        box.halfExtents.y,
        box.halfExtents.z
      )
        .setFriction(0.25)
        .setRestitution(0.1);
      this.world.createCollider(colDesc, body);
    }
  }

  public step(): void {
    this.world.step();
  }

  public dispose(): void {
    if (this.initialized) {
      this.staticBodies = [];
      this.world.free();
      this.initialized = false;
    }
  }
}
