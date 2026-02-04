import * as THREE from 'three';
import { BLOCK_HEIGHT, COLUMN_DEPTH, COLUMN_HEIGHT, COLUMN_WIDTH, handleMaterial, hoverMaterial, Position, selectedMaterial } from './main';
import { Block } from './block';

interface Handle {
	mesh: THREE.Group;
	direction: string;
}

export class Column {
	scene: THREE.Scene;
	mesh: THREE.Mesh;
	position: Position;
	handles: Handle[];
	blocks: Block[];

	constructor(scene: THREE.Scene, x: number, z: number) {
		this.scene = scene;
		this.position = {x, y:0, z};
		this.mesh= this.createMesh();
		this.scene.add(this.mesh);
		this.handles = this.createHandles();
		this.blocks = [];
	}

	addBlock(toColumn: Column) {
		const block = new Block(this.scene, this, toColumn, BLOCK_HEIGHT / 2);
		return block;
	}

	setHover(hovered: boolean) {
		this.mesh.material = hovered ? hoverMaterial : columnMaterial;
	}

	setSelected(selected: boolean) {
		this.mesh.material = selected ? selectedMaterial : columnMaterial;
		this.handles.forEach(h => h.mesh.visible = selected);
	}

	createMesh() {
		const geometry = new THREE.BoxGeometry(COLUMN_WIDTH, COLUMN_HEIGHT, COLUMN_DEPTH);
		const mesh = new THREE.Mesh(geometry, columnMaterial);
		mesh.position.set(this.position.x, 1.5, this.position.z);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.userData.type = 'column';
		mesh.userData.column = this;
		return mesh;
	}

	createHandles() {
    const handles: Handle[] = [];
    const halfWidth = COLUMN_WIDTH / 2;
    const halfDepth = COLUMN_DEPTH / 2;
    const arrowLength = 0.6;

    const directions = [
        { dir: 'north', x: 0, z: -halfDepth, rotation: Math.PI },      // Pointing -Z
        { dir: 'south', x: 0, z: halfDepth, rotation: 0 },            // Pointing +Z
        { dir: 'east', x: halfWidth, z: 0, rotation: Math.PI / 2 },   // Pointing +X
        { dir: 'west', x: -halfWidth, z: 0, rotation: -Math.PI / 2 }  // Pointing -X
    ];

    directions.forEach(({ dir, x, z, rotation }) => {
        const group = new THREE.Group();

        // 1. Shaft: Cylinder is Y-up by default. 
        // We rotate it to lie along the Z-axis.
        const shaftGeometry = new THREE.CylinderGeometry(0.05, 0.05, arrowLength, 8);
        const shaft = new THREE.Mesh(shaftGeometry, handleMaterial);
        shaft.rotation.x = Math.PI / 2; 
        // Offset so the base of the shaft is at the group's origin (0,0,0)
        shaft.position.z = arrowLength / 2;
        group.add(shaft);

        // 2. Head: Cone is Y-up by default.
        const headGeometry = new THREE.ConeGeometry(0.15, 0.5, 14);
        const head = new THREE.Mesh(headGeometry, handleMaterial);
        head.rotation.x = Math.PI / 2; 
        // Place head at the tip of the shaft
        head.position.z = arrowLength + 0.125; 
        group.add(head);

        // 3. Group Placement
        group.position.set(this.position.x + x, 0, this.position.z + z);
        group.rotation.y = rotation;

        // Apply metadata to all parts for raycasting
        group.traverse((child) => {
            child.userData = { type: 'columnHandle', column: this, direction: dir };
        });

        group.visible = false;
        this.scene.add(group);
        handles.push({ mesh: group, direction: dir });
    });

    return handles;
}	

	destroy() {
		for (let b of this.blocks) {
			b.destroy()
		}
		this.scene.remove(this.mesh);
		for (let h of this.handles) {
			this.scene.remove(h.mesh);
		}
	}
}

// Materials
const columnMaterial = new THREE.MeshStandardMaterial({
	color: 0x636363,
	roughness: 0.7,
	metalness: 0.3
});
