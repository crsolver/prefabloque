import * as THREE from 'three';
import { Column } from "./column";
import { BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, handleMaterial, Position, selectedMaterial } from './main';

export class Block {
	scene: THREE.Scene;
	fromColumn: Column;
	toColumn: Column;
	//index: number;
	mesh: THREE.Mesh;
	handle: {mesh: THREE.Group};
	position: Position;

	constructor(scene: THREE.Scene, fromColumn: Column, toColumn: Column, y: number) {
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
		this.mesh.material = hovered ? blockHoverMaterial : blockMaterial;
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
		this.scene.remove(this.mesh);
		this.scene.remove(this.handle.mesh);
	}

	getConnectedBlocks() {
		const connected = new Set();
		const visited = new Set();
		const queue: Block[] = [this];

		while (queue.length > 0) {
			const block = queue.shift();
			if (block === undefined) continue;
			if (visited.has(block)) continue;
			visited.add(block);
			connected.add(block);

			// Find all blocks sharing columns with this block
			const columns = [block.fromColumn, block.toColumn];
			
			columns.forEach(column => {
				column.blocks.forEach(b => {
					if (!visited.has(b)) {
						queue.push(b);
					}
				});
			});
		}

		return Array.from(connected);
	}
}

const blockMaterial = new THREE.MeshStandardMaterial({
	color: 0x737373,
	roughness: 0.6,
	metalness: 0.2
});

const blockHoverMaterial = new THREE.MeshStandardMaterial({
	color: 0xffd100,
	roughness: 0.5,
	metalness: 0.5,
	emissive: 0xffd100,
	emissiveIntensity: 0.3
});

