import * as THREE from 'three';
import { Column } from "./column";
import { BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, handleMaterial, hoverMaterial, Position, selectedMaterial } from './main';

export class Block {
	id: string;
	scene: THREE.Scene;
	fromColumn: Column;
	toColumn: Column;
	//index: number;
	mesh: THREE.Mesh;
	handle: {mesh: THREE.Group};
	position: Position;

	constructor(scene: THREE.Scene, fromColumn: Column, toColumn: Column, y: number) {
		this.id = Math.random().toString(36).substring(2, 15);
		fromColumn.blocks.push(this);
		toColumn.blocks.push(this);
		this.scene = scene;
		this.fromColumn = fromColumn;
		this.toColumn = toColumn;
		this.position = {
			x: (fromColumn.position.x + toColumn.position.x) / 2,
			y, 
			z: (fromColumn.position.z + toColumn.position.z) / 2
		};
		this.mesh = this.createMesh();
		this.handle = this.createHandle();
		scene.add(this.mesh);
	}

	setHover(hovered: boolean) {
		this.mesh.material = hovered ? hoverMaterial : blockMaterial;
	}

	createMesh() {
		const geometry = new THREE.BoxGeometry(BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_DEPTH);
		const mesh = new THREE.Mesh(geometry, blockMaterial);

		mesh.position.set(this.position.x, this.position.y, this.position.z);

		// Rotate block to align with columns - swap dx and dz
		const dx = this.toColumn.position.x - this.fromColumn.position.x;
		const dz = this.toColumn.position.z - this.fromColumn.position.z;
		const angle = Math.atan2(dz, dx);
		mesh.rotation.y = angle;

		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.userData.type = 'block';
		mesh.userData.block = this;
		return mesh;
	}

	createHandle() {
		const group = new THREE.Group();
		
		// Make a larger, more visible handle - arrow pointing up
		const shaftGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 16);
		const shaft = new THREE.Mesh(shaftGeometry, handleMaterial);
		group.add(shaft);
		
		// Arrow head pointing up
		const headGeometry = new THREE.ConeGeometry(0.15, 0.3, 16);
		const head = new THREE.Mesh(headGeometry, handleMaterial);
		head.position.y = 0.35;
		head.userData.type = 'blockHandle';
		head.userData.block = this;
		group.add(head);
		
		// Also set on shaft for raycasting
		shaft.userData.type = 'blockHandle';
		shaft.userData.block = this;
		
		group.position.copy(this.mesh.position);
		group.position.y += BLOCK_HEIGHT / 2 + 0.5;
		group.userData.type = 'blockHandle';
		group.userData.block = this;
		group.visible = false;
		
		this.scene.add(group);
		
		return { mesh: group };
	}

	setSelected(selected: boolean) {
		this.mesh.material = selected ? selectedMaterial : blockMaterial;
		this.handle.mesh.visible = selected;
	}

	destroy() {
		this.toColumn.blocks = this.toColumn.blocks.filter((b) =>  b !== this);
		this.fromColumn.blocks = this.fromColumn.blocks.filter((b) =>  b !== this);
		this.scene.remove(this.mesh);
		this.scene.remove(this.handle.mesh);
	}

	getConnectedBlocks(): Block[] {
		const connected: Block[] = [];
		const visited = new Set<string>();
		const queue: Block[] = [this];

		visited.add(this.id);

		// Reference values from the starting block
		const refRot = this.mesh.rotation.y;
		const refPos = this.position;

		// Determine the "depth" axis based on rotation.
		// If the wall is horizontal (0 or PI), depth is Z. 
		// If the wall is vertical (PI/2), depth is X.
		// We use a small epsilon for float comparisons.
		const isNorthSouth = Math.abs(Math.sin(refRot)) > 0.5; 

		while (queue.length > 0) {
			const block = queue.shift()!;

			// 1. Check Height (Y-axis)
			const sameHeight = Math.abs(block.position.y - refPos.y) < 0.01;
			
			// 2. Check Rotation (Parallel)
			const sameRotation = Math.abs(block.mesh.rotation.y - refRot) < 0.01;

			// 3. Check Planar Alignment (The "relevant axis")
			// If the wall points North/South (Z-aligned), X must be constant.
			// If the wall points East/West (X-aligned), Z must be constant.
			const samePlane = isNorthSouth 
				? Math.abs(block.position.x - refPos.x) < 0.01
				: Math.abs(block.position.z - refPos.z) < 0.01;

			if (sameHeight && sameRotation && samePlane) {
				connected.push(block);
			}

			// Traversal logic
			[block.fromColumn, block.toColumn].forEach(column => {
				if (!column) return;
				for (const b of column.blocks) {
					if (!visited.has(b.id)) {
						visited.add(b.id);
						queue.push(b);
					}
				}
			});
		}

		return connected;
	}

	getConnectedBlocks2(): Block[] {
		const connected: Block[] = [];
		const visited = new Set<string>(); // Store block IDs here
		const queue: Block[] = [this];

		// Mark start as visited using its ID
		visited.add(this.id); 

		while (queue.length > 0) {
			const block = queue.shift()!;
			if (block.position.y === this.position.y && 
				block.mesh.rotation.equals(this.mesh.rotation)
			) {
				connected.push(block);
			}

			// Check both from and to columns
			[block.fromColumn, block.toColumn].forEach(column => {
				if (!column) return;

				for (const b of column.blocks) {
					if (!visited.has(b.id)) {
						visited.add(b.id);
						queue.push(b);
					}
				}
			});
		}

		return connected;
	}
}

const blockMaterial = new THREE.MeshStandardMaterial({
	color: 0x6b6b6b,
	roughness: 1,
});
