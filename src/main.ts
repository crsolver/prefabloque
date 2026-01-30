import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Column } from './column';
import { userData } from 'three/tsl';
import { Block } from './block';

export interface Position {
  x: number,
  y: number,
  z: number,
}

export const handleMaterial = new THREE.MeshBasicMaterial({ 
	color: 0xff8800,
});

// Constants
export const BLOCK_WIDTH = 1.41;
export const BLOCK_HEIGHT = 0.41;
export const BLOCK_DEPTH = 0.2;
export const COLUMN_WIDTH = 0.3;
export const COLUMN_DEPTH = 0.3;
export const MIN_COLUMN_DISTANCE = 1.5;
export const BLOCK_ADD_THRESHOLD = 0.3;

type Direction = 'north' | 'south' | 'east' | 'west'

// Global state

interface State {
  columns: Column[],
  blocks: Block[],
  selectedColumn: Column | null,
  hoverColumn: Column | null,
  hoverBlock: Block | null,
  selectedBlocks: Block[],
  dragColHandle: {
    handle: THREE.Object3D;
    column: Column;
    created: number;
    direction: string;
    startPoint: THREE.Vector3;
    lastColumn: Column;
  } | null,
  isDragging: boolean,
  dragStart: Position | null,
  currentDirection: Direction | null,
  gridVisible: boolean,
  multiBlockMode: boolean 
}

const state: State = {
  columns: [], 
  blocks: [],
  selectedColumn: null,
  selectedBlocks: [],
  hoverColumn: null,
  hoverBlock: null,
  dragColHandle: null,
  isDragging: false,
  dragStart: null,
  currentDirection: null,
  gridVisible: true,
  multiBlockMode: false
};

// Scene setup ________________________________________________________________
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141414);
scene.fog = new THREE.Fog(0x0a0e17, 30, 50);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(4, 4, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight);
const canvas = renderer.domElement
document.body.appendChild(canvas);


// Controls ___________________________________________________________________

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.mouseButtons = {
  RIGHT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  LEFT: null
};


// Lighting ___________________________________________________________________

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
mainLight.position.set(5, 10, 5);
mainLight.castShadow = true;
mainLight.shadow.camera.near = 0.1;
mainLight.shadow.camera.far = 50;
mainLight.shadow.camera.left = -20;
mainLight.shadow.camera.right = 20;
mainLight.shadow.camera.top = 20;
mainLight.shadow.camera.bottom = -20;
mainLight.shadow.mapSize.width = 2048;
mainLight.shadow.mapSize.height = 2048;
scene.add(mainLight);

const fillLight = new THREE.DirectionalLight(0x00d9ff, 0.3);
fillLight.position.set(-5, 5, -5);
scene.add(fillLight);

const accentLight = new THREE.PointLight(0x00ff88, 0.5, 20);
accentLight.position.set(0, 3, 0);
scene.add(accentLight);


// Grid floor _________________________________________________________________

const grid = createFadingGrid(BLOCK_WIDTH, 60, 0x7d7d7d)
scene.add(grid);

// Create floor plane
const floorGeometry = new THREE.PlaneGeometry(2, 2);
const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x0f1419,
  roughness: 0.9,
  metalness: 0.1
});

const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
//scene.add(floor);

new Column(scene, 0, 0)

// Raycaster for picking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();


// Event Listeners ____________________________________________________________

renderer.domElement.addEventListener('mousemove', onMouseMove);
renderer.domElement.addEventListener('mousedown', onMouseDown);
renderer.domElement.addEventListener('mouseup', onMouseUp);


// ____________________________________________________________________________
function removeHoverAll() {
  state.hoverBlock?.setHover(false);
  state.hoverColumn?.setHover(false);
  state.hoverColumn = null;
  state.hoverBlock = null;
}

function deselectAll() {
  state.selectedColumn?.setSelected(false);
  state.selectedColumn = null;
  for (let blck of state.selectedBlocks) {
    blck.setSelected(false)
  }
  state.selectedBlocks = []
}

function selectColumn(column: Column) {
  deselectAll();
  state.selectedColumn = column;
  column.setSelected(true);
}

function selectBlock(block: Block) {
  deselectAll();
  state.selectedBlocks.push(block);
  block.setSelected(true);
}

function hoverColumn(column: Column) {
  removeHoverAll();
  state.hoverColumn = column;
  column.setHover(true);
}

function hoverBlock(block: Block) {
  removeHoverAll();
  state.hoverBlock = block;
  block.setHover(true);
}

function startColumnDrag(column: Column, handle: THREE.Object3D, direction: Direction, point: THREE.Vector3) {
  state.isDragging = true;
  state.dragColHandle = { 
    handle,
    column, 
    direction,
    startPoint: point.clone(),
    created: 0,
    lastColumn: column
  };
  state.dragStart = point.clone();
  state.currentDirection = direction;
  //controls.enabled = false;
}

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  let columnFound = false;
  let blockFound = false;
  let foundHandle: {userData: Record<string, any>, handle: THREE.Object3D, point: THREE.Vector3} | null = null;
  
  for (const intersect of intersects) {
    const userData = intersect.object.userData;
    if (userData.type === 'column') {
      columnFound = true;
      selectColumn(userData.column)
      break;
    } else if (userData.type === 'block') {
      blockFound = true;
      selectBlock(userData.block)
      break;
    } else if (userData.type === 'columnHandle') {
      foundHandle = { userData, handle: intersect.object, point: intersect.point }
    }
  }
  
  if (foundHandle) {
    const userData = foundHandle.userData
    startColumnDrag(userData.column, foundHandle.handle, userData.direction, foundHandle.point)
  } else if (!columnFound && !blockFound) {
    deselectAll()
  }
}

function onMouseMove(event: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  if (!state.isDragging) {
    // Hover effects
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    let columnFound = false;
    let blockFound = false;

    if (intersects.length > 0) {
      const userData = intersects[0].object.userData;
      if (userData.type === 'column') {
        columnFound = true;
        const column: Column = userData.column;
        // Don't hover the selected column
        if (column !== state.selectedColumn) {
          renderer.domElement.style.cursor = 'pointer';
          hoverColumn(column)
        } else {
          // Still show pointer cursor for selected column
          renderer.domElement.style.cursor = 'pointer';
        }
      } else if (userData.type == 'block') {
        blockFound = true;
        const block: Block = userData.block;
        // Don't hover the selected block
        if (!state.selectedBlocks.includes(block)) {
          renderer.domElement.style.cursor = 'pointer';
          hoverBlock(block)
        } else {
          renderer.domElement.style.cursor = 'pointer';
        }
      } else if (userData.type == 'columnHandle') {
        renderer.domElement.style.cursor = 'grab';
      } else {
        renderer.domElement.style.cursor = 'crosshair';
      }
    } else {
      renderer.domElement.style.cursor = 'crosshair';
    }

    if (!columnFound) {
      // Clear previous hover state
      if (state.hoverColumn && state.hoverColumn !== state.selectedColumn) {
        state.hoverColumn?.setHover(false);
      }
      state.hoverColumn = null;
    }
    if (!blockFound) {
      // Clear previous hover state
      if (state.hoverBlock && !state.selectedBlocks.includes(state.hoverBlock)) {
        state.hoverBlock?.setHover(false);
      }
      state.hoverBlock = null;
    }
  }

  // Handle dragging
  raycaster.setFromCamera(mouse, camera);

  if (state.dragColHandle) {
    handleColumnDrag();
  }
}

function onMouseUp(event: MouseEvent) {
  if (state.isDragging) {
    state.isDragging = false;
    state.dragColHandle = null;
    state.dragStart = null;
    state.currentDirection = null;
    controls.enabled = true;
  }
}

function handleColumnDrag() {
  if (state.dragColHandle === null) return;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersectPoint = new THREE.Vector3();
  
  if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
    const column = state.dragColHandle.column;
    const direction = state.dragColHandle.direction;

    // Calculate direction vector
    let dirX = 0, dirZ = 0;
    switch (direction) {
      case 'north':
        dirZ = -1;
        break;
      case 'south':
        dirZ = 1;
        break;
      case 'east':
        dirX = 1;
        break;
      case 'west':
        dirX = -1;
        break;
    }

    // Calculate distance in the drag direction from original start point
    const dragDelta = new THREE.Vector3().subVectors(intersectPoint, state.dragColHandle.startPoint);
    const dragDistance = Math.abs(dragDelta.x * dirX + dragDelta.z * dirZ);

    const handle = state.dragColHandle.handle;
    // Calculate how many columns should exist
    const targetColumns = Math.floor(dragDistance / MIN_COLUMN_DISTANCE);

    // Get current column count in this direction
    const currentColumns = state.dragColHandle.created || 0;

    // Create additional columns if needed
    if (targetColumns > currentColumns) {
      let lastColumn = state.dragColHandle.lastColumn || column;
      
      for (let i = currentColumns; i < targetColumns; i++) {
        const distance = (i + 1) * MIN_COLUMN_DISTANCE;
        const newX = column.position.x + dirX * distance;
        const newZ = column.position.z + dirZ * distance;

        // Check if column already exists
        let targetColumn = state.columns.find(c => 
          Math.abs(c.position.x - newX) < 0.1 && Math.abs(c.position.z - newZ) < 0.1
        );

        if (!targetColumn) {
          targetColumn = new Column(scene, newX, newZ);
          state.columns.push(targetColumn);
          selectColumn(targetColumn)
        }

        // Add block if it doesn't exist
        const blockExists = state.blocks.some(b => 
          (b.fromColumn === lastColumn && b.toColumn === targetColumn) ||
          (b.fromColumn === targetColumn && b.toColumn === lastColumn)
        );

        if (!blockExists) {
          const block = lastColumn.addBlock(targetColumn);
          state.blocks.push(block)
        }

        lastColumn = targetColumn;
      }

      state.dragColHandle.created = targetColumns;
      state.dragColHandle.lastColumn = lastColumn;
    }
  }
}

// ____________________________________________________________________________

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update()
  renderer.render(scene, camera);
}

animate()

// ____________________________________________________________________________
// Create a custom grid with fading
function createFadingGrid(cellSize: number, divisions: number, color: number) {
  const size = cellSize * divisions; // Total grid size
  const geometry = new THREE.PlaneGeometry(size, size);
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uDivisions: { value: divisions },
      uSize: { value: size },
      uFadeDistance: { value: size * 0.8 }, // Adjust this for fade range
      uFadeStrength: { value: 2.0 }, // Higher = sharper fade
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uDivisions;
      uniform float uSize;
      uniform float uFadeDistance;
      uniform float uFadeStrength;
      
      varying vec3 vWorldPosition;
      
      void main() {
        // Create grid pattern
        vec2 coord = vWorldPosition.xz;
        vec2 grid = abs(fract(coord * uDivisions / uSize - 0.5) - 0.5) / fwidth(coord * uDivisions / uSize);
        float line = min(grid.x, grid.y);
        float gridPattern = 1.0 - min(line, 1.0);
        
        // Calculate distance fade from center
        float dist = length(vWorldPosition.xz);
        float fadeFactor = 1.0 - smoothstep(0.0, uFadeDistance, dist);
        fadeFactor = pow(fadeFactor, uFadeStrength);
        
        // Combine grid with fade
        float alpha = gridPattern * fadeFactor;
        
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  
  return mesh;
}
