import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Column } from './column';
import { Block } from './block';

// Constants
export let BLOCK_WIDTH = 1.41;
export let BLOCK_HEIGHT = 0.41;
export let BLOCK_DEPTH = 0.2;
export let COLUMN_WIDTH = 0.3;
export let COLUMN_HEIGHT = 3;
export let COLUMN_DEPTH = 0.3;
export let MIN_COLUMN_DISTANCE = 1.5;
export let BLOCK_ADD_THRESHOLD = 0.3;

// Required configuration parameters
const REQUIRED_PARAMS: (keyof SceneConfig)[] = ['alturaBlock', 'largoBlock', 'anchoBlock', 'alturaCol', 'anchoCol'];



// Configuration type
interface SceneConfig {
  alturaBlock: number;
  largoBlock: number;
  anchoBlock: number;
  alturaCol: number;
  anchoCol: number;
}

// Parse URL parameters
function getUrlParams(): Partial<Record<string, string>> {
  const params = new URLSearchParams(window.location.search);
  const config: Record<string, string> = {};
  
  params.forEach((value, key) => {
    config[key] = value;
  });
  
  return config;
}

// Check if all required params are present
function hasAllRequiredParams(config: Partial<Record<string, string>>): boolean {
  return REQUIRED_PARAMS.every(param => 
    config.hasOwnProperty(param) && config[param] !== undefined && config[param] !== ''
  );
}

// Get configuration from URL
function getConfiguration(): SceneConfig | null {
  const urlParams = getUrlParams();
    // Check if all required params are present
  if (hasAllRequiredParams(urlParams)) {
    return {
      alturaBlock: parseFloat(urlParams.alturaBlock!),
      largoBlock: parseFloat(urlParams.largoBlock!),
      anchoBlock: parseFloat(urlParams.anchoBlock!),
      anchoCol: parseFloat(urlParams.anchoCol!),
      alturaCol: parseFloat(urlParams.alturaCol!),
    };
  }
    
  // Not all params present, return null to show form
  return null;
}

document.getElementById('config-form')?.addEventListener('submit', (e: Event) => {
  e.preventDefault();
  
  const formData = new FormData(e.target as HTMLFormElement);
  
  const config: SceneConfig = {
      alturaBlock: parseFloat(formData.get('alturaBlock') as string),
      largoBlock: parseFloat(formData.get('largoBlock') as string),
      anchoBlock: parseFloat(formData.get('anchoBlock') as string),
      alturaCol: parseFloat(formData.get('alturaCol') as string),
      anchoCol: parseFloat(formData.get('anchoCol') as string)
  };
  
  // Update URL with parameters
  const params = new URLSearchParams({
      alturaBlock: config.alturaBlock.toString(),
      largoBlock: config.largoBlock.toString(),
      anchoBlock: config.anchoBlock.toString(),
      alturaCol: config.alturaCol.toString(),
      anchoCol: config.anchoCol.toString()
  });
  
  // Update URL without reloading page
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, '', newUrl);
  
  // Initialize scene
  initScene();
});


export interface Position {
  x: number,
  y: number,
  z: number,
}

export const handleMaterial = new THREE.MeshBasicMaterial({ 
	color: 0x2DABFF,
});

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
  dragBlockHandle: {
    block: Block;
    handle: THREE.Object3D;
    created: number;
    startPoint: THREE.Vector3;
    lastBlock: Block;
  } | null,
  isDragging: boolean,
  dragStart: Position | null,
  currentDirection: Direction | null,
  gridVisible: boolean,
  multiBlockMode: boolean,
  shiftPressed: boolean, 
}

const state: State = {
  columns: [], 
  blocks: [],
  selectedColumn: null,
  selectedBlocks: [],
  hoverColumn: null,
  hoverBlock: null,
  dragColHandle: null,
  dragBlockHandle: null,
  isDragging: false,
  dragStart: null,
  currentDirection: null,
  gridVisible: true,
  multiBlockMode: false,
  shiftPressed: false,
};

// UI _________________________________________________________________________
const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC'
  }).format(amount);
}

function minutosATexto(minutos: number): string {
  const minutosPorHora = 60;
  const minutosPorDia = 1440; // 24 * 60
  const minutosPorMes = 43200; // 30 * 24 * 60 (aproximado)
  
  const meses = Math.floor(minutos / minutosPorMes);
  minutos %= minutosPorMes;
  
  const dias = Math.floor(minutos / minutosPorDia);
  minutos %= minutosPorDia;
  
  const horas = Math.floor(minutos / minutosPorHora);
  minutos %= minutosPorHora;
  
  const partes = [];
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'M' : 'M'}`);
  if (dias > 0) partes.push(`${dias} ${dias === 1 ? 'd' : 'd'}`);
  if (horas > 0) partes.push(`${horas} ${horas === 1 ? 'h' : 'h'}`);
  if (minutos > 0) partes.push(`${minutos} ${minutos === 1 ? 'm' : 'm'}`);
  
  return partes.join(', ').replace(/, ([^,]*)$/, ' y $1');
}

const seleccionadosLabel = document.getElementById("seleccionados")! as HTMLParagraphElement;
const columnasLabel = document.getElementById("columnas")! as HTMLParagraphElement;
const bloquesLabel = document.getElementById("bloques")! as HTMLParagraphElement;
const tiempoLabel = document.getElementById("tiempo")! as HTMLParagraphElement;
const materialesLabel = document.getElementById("materiales")! as HTMLParagraphElement;
const obraLabel = document.getElementById("obra")! as HTMLParagraphElement;

const seleccionadosLabelSpan = document.getElementById("seleccionados-span")! as HTMLSpanElement;
const columnasLabelSpan = document.getElementById("columnas-span")! as HTMLSpanElement;
const bloquesLabelSpan = document.getElementById("bloques-span")! as HTMLSpanElement;
const tiempoLabelSpan = document.getElementById("tiempo-span")! as HTMLSpanElement;
const materialesLabelSpan = document.getElementById("materiales-span")! as HTMLSpanElement;
const obraLabelSpan = document.getElementById("obra-span")! as HTMLSpanElement;
const totalSpan = document.getElementById("total-span")! as HTMLSpanElement;

const columnPriceInput = document.getElementById('columnPrice') as HTMLInputElement;
const blockPriceInput = document.getElementById('blockPrice') as HTMLInputElement;
const blockPlacingTimeInput = document.getElementById('blockPlacingTime') as HTMLInputElement;
const columnPlacingTimeInput = document.getElementById('columnPlacingTime') as HTMLInputElement;
const hourRateInput = document.getElementById('workCostPerHour') as HTMLInputElement;

let columnCost = 10000;
let blockCost = 800;
let colTime = 40;
let blockTime = 3;
let hourRate = 2000;

const recalculate = () => {
  const columns =  state.columns.length
  const blocks =  state.blocks.length
  const materialesCost = ((columnCost * columns) + (blockCost * blocks))
  materialesLabelSpan.textContent = formatMoney(materialesCost);
  const minutes = (colTime * columns) + (blockTime * blocks)
  tiempoLabelSpan.textContent = minutosATexto(minutes)
  const obraCost = (minutes/60) * hourRate;
  obraLabelSpan.textContent = formatMoney(obraCost)
  totalSpan.textContent = formatMoney(materialesCost + obraCost)
}

let controls: OrbitControls;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let canvas: HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;

// Scene setup ________________________________________________________________
function initScene() {
  document.getElementById('sceneSettingsModal')!.style.display = 'none';

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141414);
  //scene.fog = new THREE.Fog(0x0a0e17, 30, 50);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(4, 4, 4);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvas = renderer.domElement
  document.body.appendChild(canvas);


  // Controls ___________________________________________________________________

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.mouseButtons = {
    RIGHT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    LEFT: null
  };

  // Lighting ___________________________________________________________________

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
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

  const grid = createFadingGrid(BLOCK_WIDTH, 60, 0x6b6b6b)
  scene.add(grid);

  // Create floor plane
  const floorGeometry = new THREE.PlaneGeometry(60, 60);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x141414,
  });

  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  //scene.add(floor);

  state.columns.push(new Column(scene, 0, 0));
  recalculate()
  // Raycaster for picking
  // Event Listeners ____________________________________________________________

  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate()
}


// ____________________________________________________________________________

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Shift') {
    state.shiftPressed = true;
  }

  if (event.key === 'a') {
    // 1. Create a snapshot/copy of the currently selected blocks 
    // or collect the new ones in a separate list.
    const blocksToSelect = new Set<Block>();

    for (let selected of state.selectedBlocks) {
        const connected = selected.getConnectedBlocks();
        for (let block of connected) {
            blocksToSelect.add(block);
        }
    }

    // 2. Now apply the selection after the search is done
    blocksToSelect.forEach(block => selectBlock(block));
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (event.key === 'Shift') {
    state.shiftPressed = false;
  }
};

function removeHoverAll() {
  if (state.hoverBlock && !state.selectedBlocks.includes(state.hoverBlock)) {
    state.hoverBlock.setHover(false);
  }
  state.hoverColumn?.setHover(false);
  state.hoverColumn = null;
  state.hoverBlock = null;
}

function deselectAllColumns() {
  state.selectedColumn?.setSelected(false);
  state.selectedColumn = null;
}

function deselectAllBlocks() {
  for (let blck of state.selectedBlocks) {
    blck.setSelected(false)
  }
  state.selectedBlocks = []
}

function deselectAll() {
  deselectAllColumns();
  deselectAllBlocks();
}

function selectColumn(column: Column) {
  deselectAll();
  state.selectedColumn = column;
  column.setSelected(true);
}

function selectBlock(block: Block) {
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

function startBlockDrag(block: Block, handle: THREE.Object3D, point: THREE.Vector3) {
  state.isDragging = true;
  state.dragBlockHandle = { 
    block,
    handle,
    startPoint: point.clone(),
    created: 0,
    lastBlock: block,
  };
  state.dragStart = point.clone();
  controls.enabled = false;
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
  controls.enabled = false;
}


function deselectBlock(block: Block) {
  // Check if the block is in selectedBlocks
  const index = state.selectedBlocks.indexOf(block);
  if (index !== -1) {
    // Remove from selectedBlocks array
    state.selectedBlocks.splice(index, 1);
    // Update the block's visual state
    block.setSelected(false);
  }
}

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  let columnFound = false;
  let blockFound = false;
  let foundHandle: {type: 'col' | 'block', userData: Record<string, any>, handle: THREE.Object3D, point: THREE.Vector3} | null = null;
  
  if (intersects.length > 0) {
    const intersect = intersects[0];
    const userData = intersect.object.userData;
    if (userData.type === 'columnHandle') {
      foundHandle = { type: 'col', userData, handle: intersect.object, point: intersect.point }
    } else if (userData.type === 'blockHandle') {
      foundHandle = { type: 'block', userData, handle: intersect.object, point: intersect.point }
    } else if (userData.type === 'column') {
      columnFound = true;
      selectColumn(userData.column)
    } else if (userData.type === 'block') {
      blockFound = true;
      deselectAllColumns();
      if (!state.shiftPressed) {
        deselectAllBlocks();
      }
      if (state.selectedBlocks.includes(userData.block)) {
        deselectBlock(userData.block)
      } else {
        selectBlock(userData.block);
      }
    }
  }
  
  if (foundHandle) {
    const userData = foundHandle.userData
    if (foundHandle.type === 'col') {
      startColumnDrag(userData.column, foundHandle.handle, userData.direction, foundHandle.point)
    } else {
      startBlockDrag(userData.block, foundHandle.handle, foundHandle.point)
    }
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
      } else if (userData.type === 'columnHandle' || userData.type === 'blockHandle') {
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
  if (state.dragBlockHandle) {
    handleBlockDrag();
  }
}

function onMouseUp(event: MouseEvent) {
  if (state.isDragging) {
    stopDragging();
  }
}

function stopDragging() {
  state.isDragging = false;
  state.dragColHandle = null;
  state.dragBlockHandle = null;
  state.dragStart = null;
  state.currentDirection = null;
  controls.enabled = true;
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
          columnasLabelSpan.textContent = state.columns.length.toString()
          recalculate()
          selectColumn(targetColumn)
        }

        // Add block if it doesn't exist
        const blockExists = state.blocks.some(b => 
          (b.fromColumn === lastColumn && b.toColumn === targetColumn) ||
          (b.fromColumn === targetColumn && b.toColumn === lastColumn)
        );

        if (!blockExists) {
          const block = lastColumn.addBlock(targetColumn);
          state.blocks.push(block);
          bloquesLabelSpan.textContent = state.blocks.length.toString();
          recalculate();
        }

        lastColumn = targetColumn;
      }

      state.dragColHandle.created = targetColumns;
      state.dragColHandle.lastColumn = lastColumn;
    }
  }
}

function deselectBlocksBelow(block: Block) {
  // Find all selected blocks that are below this block and in the same column span
  const blocksToDeselect = state.selectedBlocks.filter(b =>
    b.fromColumn === block.fromColumn &&
    b.toColumn === block.toColumn &&
    b.position.y < block.position.y
  );
  
  // Deselect them
  for (const b of blocksToDeselect) {
    b.setSelected(false);
  }
  
  // Remove them from selectedBlocks array
  state.selectedBlocks = state.selectedBlocks.filter(b => !blocksToDeselect.includes(b));
}

function handleBlockDrag() {
  if (state.dragBlockHandle === null) return;
  
  // Use the camera's view direction to create a vertical plane
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  cameraDirection.y = 0; // Project onto horizontal plane
  cameraDirection.normalize();
  
  // Create a vertical plane perpendicular to camera view, passing through start point
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    cameraDirection,
    state.dragBlockHandle.startPoint
  );
  
  const intersectPoint = new THREE.Vector3();
  
  if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
    // Calculate the drag distance from the original start point
    const absoluteDragDistance = intersectPoint.y - state.dragBlockHandle.startPoint.y;
    
    // Only count upward dragging
    if (absoluteDragDistance < 0) return;

    // Calculate the target Y position where the cursor is pointing
    const targetY = state.dragBlockHandle.startPoint.y + absoluteDragDistance;
    const selected = state.selectedBlocks; 
    // Iterate through all selected blocks
    for (const baseBlock of selected) {
      // Calculate how many blocks should exist above this specific block
      // based on how far the target Y is above this block
      const heightAboveThisBlock = targetY - baseBlock.position.y;
      
      // Skip if target is below this block
      if (heightAboveThisBlock <= 0) continue;
      
      const blocksToCreate = Math.floor(heightAboveThisBlock / BLOCK_HEIGHT);
      
      // Find existing blocks above this base block
      const existingBlocksAbove = state.blocks.filter(b =>
        b.fromColumn === baseBlock.fromColumn &&
        b.toColumn === baseBlock.toColumn &&
        b.position.y > baseBlock.position.y &&
        b.position.y <= baseBlock.position.y + (blocksToCreate * BLOCK_HEIGHT) + 0.01
      ).length;
      
      // Create missing blocks
      for (let i = existingBlocksAbove; i < blocksToCreate; i++) {
        const newY = baseBlock.position.y + ((i + 1) * BLOCK_HEIGHT);
        
        // Don't exceed column height
        if (newY >= COLUMN_HEIGHT) {
          break;
        }

        // Check if block already exists at this height
        const targetBlock = state.blocks.find(b => 
          b.fromColumn === baseBlock.fromColumn &&
          b.toColumn === baseBlock.toColumn &&
          Math.abs(b.position.y - newY) < 0.1
        );

        if (!targetBlock) {
          // Create new block at the same horizontal position but higher
          const newBlock = new Block(scene, baseBlock.fromColumn, baseBlock.toColumn, newY);
          state.blocks.push(newBlock);
          bloquesLabelSpan.textContent = state.blocks.length.toString()
          recalculate()
          deselectAllColumns();
          selectBlock(newBlock);
          deselectBlocksBelow(newBlock);
        }
      }
    }

    state.dragBlockHandle.created = Math.floor(absoluteDragDistance / BLOCK_HEIGHT);
  }
}


// ____________________________________________________________________________


function animate() {
  requestAnimationFrame(animate);
  controls.update()
  renderer.render(scene, camera);
}


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

export const selectedMaterial = new THREE.MeshStandardMaterial({
	color: 0xff812d,
	roughness: 0.5,
	metalness: 0.5,
	emissive: 0xff812d,
	emissiveIntensity: 0.5
});

export const hoverMaterial = new THREE.MeshStandardMaterial({
	color: 0x96603c,
	roughness: 0.5,
	metalness: 0.5,
	emissive: 0x96603c,
	emissiveIntensity: 0.5
});

// Modal ______________________________________________________________________
// Modal functionality
const modal: HTMLElement | null = document.getElementById('settingsModal');
const openBtn: HTMLElement | null = document.getElementById('openSettingsBtn');
const closeBtn: HTMLElement | null = document.getElementById('closeModalBtn');
const cancelBtn: HTMLElement | null = document.getElementById('cancelBtn');
const form: HTMLElement | null = document.getElementById('settingsForm');

openBtn?.addEventListener('click', () => {
  modal?.classList.add('active');
  columnPriceInput.value = columnCost.toString()
  blockPriceInput.value = blockCost.toString()
  blockPlacingTimeInput.value = blockTime.toString()
  columnPlacingTimeInput.value = colTime.toString()
  hourRateInput.value = hourRate.toString()
});

closeBtn?.addEventListener('click', () => {
  modal?.classList.remove('active');
});

cancelBtn?.addEventListener('click', () => {
  modal?.classList.remove('active');
});

// Close modal when clicking outside
modal?.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.remove('active');
  }
});

// Handle form submission
interface FormData {
  columnPrice: number;
  blockPrice: number;
  blockPlacingTime: number;
  columnPlacingTime: number;
  workCostPerHour: number;
}

form?.addEventListener('submit', (e: Event) => {
  e.preventDefault();

  columnCost = parseFloat(columnPriceInput.value),
  blockCost = parseFloat(blockPriceInput.value),
  blockTime = parseFloat(blockPlacingTimeInput.value),
  colTime = parseFloat(columnPlacingTimeInput.value),
  hourRate = parseFloat(hourRateInput.value)
  recalculate();

  modal?.classList.remove('active');
});

// Auto-start if all required URL params are present
const config = getConfiguration();
if (config) {
  console.log(config)
  BLOCK_WIDTH = config.largoBlock;
  BLOCK_HEIGHT = config.alturaBlock;
  BLOCK_DEPTH = config.anchoBlock;
  COLUMN_DEPTH = config.anchoCol;
  COLUMN_WIDTH = config.anchoCol;
  COLUMN_HEIGHT = config.alturaCol;
  initScene();
}