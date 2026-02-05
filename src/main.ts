import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Column } from './column';
import { Block } from './block';
import { loadScene, saveScene } from './serialize';

// Constants
export let BLOCK_WIDTH = 1.41;
export let BLOCK_HEIGHT = 0.41;
export let BLOCK_DEPTH = 0.2;
export let COLUMN_WIDTH = 0.2;
export let COLUMN_HEIGHT = 3;
export let COLUMN_DEPTH = COLUMN_WIDTH;
export let MIN_COLUMN_DISTANCE = BLOCK_WIDTH + COLUMN_DEPTH;
let showDemo = false;

// Required configuration parameters
const REQUIRED_PARAMS: (keyof SceneConfig)[] = ['alturaBlock', 'largoBlock', 'anchoBlock', 'alturaCol', 'anchoCol', 'showDemo'];

// Configuration type
interface SceneConfig {
  alturaBlock: number;
  largoBlock: number;
  anchoBlock: number;
  alturaCol: number;
  anchoCol: number;
  showDemo: boolean;
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
      showDemo: urlParams.showDemo! === "true",
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
    anchoCol: parseFloat(formData.get('anchoCol') as string),
    showDemo: false,
  };
  
  // Update URL with parameters
  const params = new URLSearchParams({
    alturaBlock: config.alturaBlock.toString(),
    largoBlock: config.largoBlock.toString(),
    anchoBlock: config.anchoBlock.toString(),
    alturaCol: config.alturaCol.toString(),
    anchoCol: config.anchoCol.toString(),
    showDemo: "false",
  });
  
  // Update URL without reloading page
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, '', newUrl);

  BLOCK_WIDTH = config.largoBlock;
  BLOCK_HEIGHT = config.alturaBlock;
  BLOCK_DEPTH = config.anchoBlock;
  COLUMN_DEPTH = config.anchoCol;
  COLUMN_WIDTH = config.anchoCol;
  COLUMN_HEIGHT = config.alturaCol;
  MIN_COLUMN_DISTANCE = BLOCK_WIDTH + COLUMN_DEPTH;
  showDemo = config.showDemo;
  
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

export interface State {
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

function horasATexto(horas: number): string {
  const minutosPorHora = 60;
  const horasPorDia = 24;
  const horasPorMes = 720; // 30 * 24 (aproximado)
  
  // Convertir horas a minutos totales y redondear
  let minutosRestantes = Math.round(horas * minutosPorHora);
  
  const meses = Math.floor(minutosRestantes / (horasPorMes * minutosPorHora));
  minutosRestantes %= (horasPorMes * minutosPorHora);
  
  const dias = Math.floor(minutosRestantes / (horasPorDia * minutosPorHora));
  minutosRestantes %= (horasPorDia * minutosPorHora);
  
  const horasFinales = Math.floor(minutosRestantes / minutosPorHora);
  const minutos = minutosRestantes % minutosPorHora;
  
  const partes = [];
  if (meses > 0) partes.push(`${meses} M`);
  if (dias > 0) partes.push(`${dias} d`);
  if (horasFinales > 0) partes.push(`${horasFinales} h`);
  if (minutos > 0) partes.push(`${minutos} m`);
  
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
const tiempo2LabelSpan = document.getElementById("tiempo2-span")! as HTMLSpanElement;
const materialesLabelSpan = document.getElementById("materiales-span")! as HTMLSpanElement;
const obraLabelSpan = document.getElementById("obra-span")! as HTMLSpanElement;
const totalSpan = document.getElementById("total-span")! as HTMLSpanElement;

const columnPriceInput = document.getElementById('columnPrice') as HTMLInputElement;
const blockPriceInput = document.getElementById('blockPrice') as HTMLInputElement;
const blockRateInput = document.getElementById('rblock') as HTMLInputElement;
const columnRateInput = document.getElementById('rcolumn') as HTMLInputElement;
const hourRateInput = document.getElementById('workCostPerHour') as HTMLInputElement;
const hDayInput = document.getElementById('hDay') as HTMLInputElement;
const dWeekInput = document.getElementById('dWeek') as HTMLInputElement;

let columnCost = 10000;
let blockCost = 2000;
let colRate = 1;
let blockRate = 4;
let hourCost = 4000;
let hDay = 8;
let dWeek = 6;

function formatConstructionTime(totalHours:number) {
  if (totalHours === 0) return "0 days, 0 hours";

  // Calculate full days
  const fullDays = Math.floor(totalHours / hDay);
  
  // Calculate remaining hours (using modulo)
  const remainingHours = totalHours % hDay;

  // Formatting for the UI
  let result = "";
  if (fullDays > 0) {
    result += `${fullDays} d`;
  }
  if (remainingHours > 0) {
    result += `${fullDays > 0 ? ', ' : ''}${Math.round(remainingHours)} h`;
  }

  return result;
}

function formatTimeMinimal(totalHours: number) {
  if (totalHours <= 0) return "0h";

  const totalDays = totalHours / hDay;
  const daysInMonth = dWeek * 4; // 4 work weeks

  const mo = Math.floor(totalDays / daysInMonth);
  const w  = Math.floor((totalDays % daysInMonth) / dWeek);
  const d  = Math.floor(totalDays % dWeek);
  const h  = Math.round((totalHours % hDay) * 10) / 10;

  let res = [];
  if (mo > 0) res.push(`${mo} mes`);
  if (w > 0)  res.push(`${w} sem.`);
  if (d > 0)  res.push(`${d}d`);
  if (h > 0 || res.length === 0) res.push(`${h}h`);

  return res.join(' ');
}

const recalculate = () => {
  const columns =  state.columns.length
  const blocks = state.blocks.length
  columnasLabelSpan.textContent = columns.toString()
  bloquesLabelSpan.textContent = blocks.toString()

  const materialesCost = ((columnCost * columns) + (blockCost * blocks))
  materialesLabelSpan.textContent = formatMoney(materialesCost);

  const time = (columns / colRate) + (blocks / blockRate)
  tiempoLabelSpan.textContent = horasATexto(time)
  tiempo2LabelSpan.textContent = formatTimeMinimal(time)

  const obraCost = time * hourCost;
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

const demo = `{"columns":[{"x":0,"z":1.6099999999999999},{"x":0,"z":3.2199999999999998},{"x":0,"z":4.83},{"x":1.6099999999999999,"z":4.83},{"x":3.2199999999999998,"z":4.83},{"x":0,"z":6.4399999999999995},{"x":-1.6099999999999999,"z":6.4399999999999995},{"x":-3.2199999999999998,"z":6.4399999999999995},{"x":-3.2199999999999998,"z":4.83},{"x":-3.2199999999999998,"z":3.2199999999999998},{"x":-3.2199999999999998,"z":1.6099999999999994},{"x":-3.2199999999999998,"z":0},{"x":-3.2199999999999998,"z":-1.6099999999999994},{"x":3.2199999999999998,"z":3.22},{"x":3.2199999999999998,"z":1.6100000000000003},{"x":3.2199999999999998,"z":-1.6099999999999994},{"x":1.6099999999999999,"z":1.6099999999999999},{"x":1.6099999999999999,"z":0},{"x":1.6099999999999999,"z":-1.6099999999999999},{"x":0,"z":-1.6099999999999999},{"x":0,"z":-3.2199999999999998},{"x":0,"z":-4.83},{"x":1.6099999999999999,"z":-4.83},{"x":3.2199999999999998,"z":-4.83},{"x":3.2199999999999998,"z":-3.22},{"x":4.83,"z":1.6100000000000003},{"x":4.83,"z":4.440892098500626e-16},{"x":4.83,"z":-1.6099999999999994},{"x":-3.2199999999999998,"z":-3.2199999999999993},{"x":-3.2199999999999998,"z":-4.829999999999999},{"x":-1.6099999999999999,"z":-4.829999999999999},{"x":-1.6099999999999999,"z":-1.6099999999999994}],"blocks":[{"id":"xvt6ovv1hl","fromColumnIndex":0,"toColumnIndex":1,"y":0.205},{"id":"btfpclyu3xe","fromColumnIndex":1,"toColumnIndex":2,"y":0.205},{"id":"k98tp9b7y1a","fromColumnIndex":3,"toColumnIndex":4,"y":0.205},{"id":"q62wcdbkzq","fromColumnIndex":5,"toColumnIndex":6,"y":0.205},{"id":"imcq8r3zhhh","fromColumnIndex":6,"toColumnIndex":7,"y":0.205},{"id":"zqucb0q01n","fromColumnIndex":7,"toColumnIndex":8,"y":0.205},{"id":"82yxs4xrkgd","fromColumnIndex":8,"toColumnIndex":9,"y":0.205},{"id":"oy7xtld9xrf","fromColumnIndex":9,"toColumnIndex":10,"y":0.205},{"id":"3azoz4oqd7a","fromColumnIndex":10,"toColumnIndex":11,"y":0.205},{"id":"r5n5ghatzyg","fromColumnIndex":4,"toColumnIndex":13,"y":0.205},{"id":"jqavd2jbvpf","fromColumnIndex":13,"toColumnIndex":14,"y":0.205},{"id":"tw4t47psg8m","fromColumnIndex":16,"toColumnIndex":14,"y":0.205},{"id":"ymakdw7hmos","fromColumnIndex":8,"toColumnIndex":9,"y":0.615},{"id":"mrnt9bcfake","fromColumnIndex":8,"toColumnIndex":9,"y":1.025},{"id":"0pafrhmw3gs","fromColumnIndex":1,"toColumnIndex":2,"y":0.615},{"id":"xxsox6rl2il","fromColumnIndex":1,"toColumnIndex":2,"y":1.025},{"id":"d128eqfvx7b","fromColumnIndex":5,"toColumnIndex":6,"y":0.615},{"id":"isinvf4ndr","fromColumnIndex":5,"toColumnIndex":6,"y":1.025},{"id":"cd2ez4nk7sa","fromColumnIndex":4,"toColumnIndex":13,"y":0.615},{"id":"0bzei85szhbd","fromColumnIndex":4,"toColumnIndex":13,"y":1.025},{"id":"uw1188w71c9","fromColumnIndex":7,"toColumnIndex":8,"y":0.615},{"id":"hctoh9pub5","fromColumnIndex":7,"toColumnIndex":8,"y":1.025},{"id":"s343ag78m3o","fromColumnIndex":0,"toColumnIndex":1,"y":0.615},{"id":"6xu506zu5cr","fromColumnIndex":0,"toColumnIndex":1,"y":1.025},{"id":"xtsaszwon4n","fromColumnIndex":13,"toColumnIndex":14,"y":0.615},{"id":"rbyrnvptyxk","fromColumnIndex":13,"toColumnIndex":14,"y":1.025},{"id":"vnxgvpi69t","fromColumnIndex":8,"toColumnIndex":9,"y":1.4349999999999998},{"id":"ijbn6gscknc","fromColumnIndex":1,"toColumnIndex":2,"y":1.4349999999999998},{"id":"1zl9dtig5w7","fromColumnIndex":5,"toColumnIndex":6,"y":1.4349999999999998},{"id":"ffgpiifghpp","fromColumnIndex":4,"toColumnIndex":13,"y":1.4349999999999998},{"id":"mypz2h35pf","fromColumnIndex":7,"toColumnIndex":8,"y":1.4349999999999998},{"id":"7yxt059wa2e","fromColumnIndex":0,"toColumnIndex":1,"y":1.4349999999999998},{"id":"542bz8qbby","fromColumnIndex":13,"toColumnIndex":14,"y":1.4349999999999998},{"id":"x8dce6ia0h","fromColumnIndex":8,"toColumnIndex":9,"y":1.8449999999999998},{"id":"tz2onq11e7","fromColumnIndex":1,"toColumnIndex":2,"y":1.8449999999999998},{"id":"thltif8rqs","fromColumnIndex":5,"toColumnIndex":6,"y":1.8449999999999998},{"id":"5auy9ruv4v3","fromColumnIndex":4,"toColumnIndex":13,"y":1.8449999999999998},{"id":"vzclbi6zis","fromColumnIndex":7,"toColumnIndex":8,"y":1.8449999999999998},{"id":"329b10hw86q","fromColumnIndex":0,"toColumnIndex":1,"y":1.8449999999999998},{"id":"wpinb1up7o","fromColumnIndex":13,"toColumnIndex":14,"y":1.8449999999999998},{"id":"zvl0jak38og","fromColumnIndex":8,"toColumnIndex":9,"y":2.255},{"id":"lr9xk8ovgh","fromColumnIndex":1,"toColumnIndex":2,"y":2.255},{"id":"p1zyndpg7t","fromColumnIndex":5,"toColumnIndex":6,"y":2.255},{"id":"mnnbevmenm","fromColumnIndex":4,"toColumnIndex":13,"y":2.255},{"id":"20wgzw0s9rz","fromColumnIndex":7,"toColumnIndex":8,"y":2.255},{"id":"nukiump69k","fromColumnIndex":0,"toColumnIndex":1,"y":2.255},{"id":"z82ieisjejb","fromColumnIndex":13,"toColumnIndex":14,"y":2.255},{"id":"e4kfcl0acv","fromColumnIndex":8,"toColumnIndex":9,"y":2.665},{"id":"feckhd1vnx","fromColumnIndex":1,"toColumnIndex":2,"y":2.665},{"id":"hpsfg4nlirk","fromColumnIndex":5,"toColumnIndex":6,"y":2.665},{"id":"hjiee4fr6g","fromColumnIndex":3,"toColumnIndex":4,"y":2.665},{"id":"hwgl91rslf","fromColumnIndex":4,"toColumnIndex":13,"y":2.665},{"id":"84voohbo7pw","fromColumnIndex":7,"toColumnIndex":8,"y":2.665},{"id":"76iikbhixcs","fromColumnIndex":9,"toColumnIndex":10,"y":2.665},{"id":"g2htorlijjj","fromColumnIndex":10,"toColumnIndex":11,"y":2.665},{"id":"5vhw7fjqod8","fromColumnIndex":11,"toColumnIndex":12,"y":2.665},{"id":"22yfmrus1vt","fromColumnIndex":0,"toColumnIndex":1,"y":2.665},{"id":"eb666km9zzj","fromColumnIndex":2,"toColumnIndex":5,"y":2.665},{"id":"0hgcr0hqv4h","fromColumnIndex":6,"toColumnIndex":7,"y":2.665},{"id":"86jnc3naznd","fromColumnIndex":13,"toColumnIndex":14,"y":2.665},{"id":"u4y59hu3ren","fromColumnIndex":16,"toColumnIndex":14,"y":0.615},{"id":"tdf8t75exvh","fromColumnIndex":16,"toColumnIndex":14,"y":1.025},{"id":"8jg59bckqp","fromColumnIndex":16,"toColumnIndex":14,"y":1.4349999999999998},{"id":"zz9a42aqeon","fromColumnIndex":16,"toColumnIndex":14,"y":1.8449999999999998},{"id":"jcszsmqoqgg","fromColumnIndex":16,"toColumnIndex":14,"y":2.255},{"id":"9fntafbhdes","fromColumnIndex":16,"toColumnIndex":14,"y":2.665},{"id":"uzj6lg1lrtc","fromColumnIndex":0,"toColumnIndex":16,"y":2.665},{"id":"3p7jv57w0wt","fromColumnIndex":2,"toColumnIndex":3,"y":0.205},{"id":"6qsnjdxpsev","fromColumnIndex":2,"toColumnIndex":3,"y":0.615},{"id":"a02zle1k5b","fromColumnIndex":2,"toColumnIndex":3,"y":1.025},{"id":"n38tmqodkn","fromColumnIndex":2,"toColumnIndex":3,"y":1.4349999999999998},{"id":"bknkr5nn4ln","fromColumnIndex":2,"toColumnIndex":3,"y":1.8449999999999998},{"id":"avejgajsqsb","fromColumnIndex":2,"toColumnIndex":3,"y":2.255},{"id":"wev833o0pnm","fromColumnIndex":2,"toColumnIndex":3,"y":2.6649999999999996},{"id":"lbtfirl1cw","fromColumnIndex":17,"toColumnIndex":16,"y":0.205},{"id":"pkod0a1het","fromColumnIndex":18,"toColumnIndex":15,"y":0.205},{"id":"javavcsym9m","fromColumnIndex":19,"toColumnIndex":20,"y":0.205},{"id":"5hrt0zexopx","fromColumnIndex":20,"toColumnIndex":21,"y":0.205},{"id":"hl6pz7rigj6","fromColumnIndex":21,"toColumnIndex":22,"y":0.205},{"id":"dlb13zerhuh","fromColumnIndex":22,"toColumnIndex":23,"y":0.205},{"id":"ojzt3chc3p","fromColumnIndex":23,"toColumnIndex":24,"y":0.205},{"id":"zxese1khi","fromColumnIndex":24,"toColumnIndex":15,"y":0.205},{"id":"a86pfrva8gh","fromColumnIndex":24,"toColumnIndex":15,"y":0.615},{"id":"23n2ibnjzqg","fromColumnIndex":24,"toColumnIndex":15,"y":1.025},{"id":"z2q9ag5x6mr","fromColumnIndex":20,"toColumnIndex":21,"y":0.615},{"id":"tc3cw8ex0p","fromColumnIndex":20,"toColumnIndex":21,"y":1.025},{"id":"c52bdz5mmfl","fromColumnIndex":23,"toColumnIndex":24,"y":0.615},{"id":"ynbvts70iw","fromColumnIndex":23,"toColumnIndex":24,"y":1.025},{"id":"4d2cpmu05v2","fromColumnIndex":21,"toColumnIndex":22,"y":0.615},{"id":"ciqo4q1ciyw","fromColumnIndex":21,"toColumnIndex":22,"y":1.025},{"id":"yq31fruttl","fromColumnIndex":19,"toColumnIndex":20,"y":0.615},{"id":"6hkn4hkj1ro","fromColumnIndex":19,"toColumnIndex":20,"y":1.025},{"id":"nqqq5zpp91q","fromColumnIndex":24,"toColumnIndex":15,"y":1.4349999999999998},{"id":"w0ah8qnzzo","fromColumnIndex":20,"toColumnIndex":21,"y":1.4349999999999998},{"id":"z4pj2gdl59","fromColumnIndex":23,"toColumnIndex":24,"y":1.4349999999999998},{"id":"dcny6a7wyc","fromColumnIndex":21,"toColumnIndex":22,"y":1.4349999999999998},{"id":"6prg06sm97a","fromColumnIndex":19,"toColumnIndex":20,"y":1.4349999999999998},{"id":"exq5fzt4dwp","fromColumnIndex":24,"toColumnIndex":15,"y":1.8449999999999998},{"id":"c2v1mrm35cs","fromColumnIndex":20,"toColumnIndex":21,"y":1.8449999999999998},{"id":"3s5iq0c9qep","fromColumnIndex":23,"toColumnIndex":24,"y":1.8449999999999998},{"id":"77xvv9b3xcv","fromColumnIndex":21,"toColumnIndex":22,"y":1.8449999999999998},{"id":"cr506t3ss6s","fromColumnIndex":19,"toColumnIndex":20,"y":1.8449999999999998},{"id":"5rd8ks0dmdl","fromColumnIndex":24,"toColumnIndex":15,"y":2.255},{"id":"p9l36w7jwvp","fromColumnIndex":20,"toColumnIndex":21,"y":2.255},{"id":"h3vycewmt3n","fromColumnIndex":23,"toColumnIndex":24,"y":2.255},{"id":"2rspf8cf4xh","fromColumnIndex":21,"toColumnIndex":22,"y":2.255},{"id":"gyqwtmqhq19","fromColumnIndex":19,"toColumnIndex":20,"y":2.255},{"id":"7c5s9smc3hw","fromColumnIndex":24,"toColumnIndex":15,"y":2.665},{"id":"rnlu5y2h8ro","fromColumnIndex":22,"toColumnIndex":23,"y":2.665},{"id":"l2v5disqlam","fromColumnIndex":18,"toColumnIndex":19,"y":2.665},{"id":"obj5stsfrtm","fromColumnIndex":20,"toColumnIndex":21,"y":2.665},{"id":"7pbs0pqjm4s","fromColumnIndex":23,"toColumnIndex":24,"y":2.665},{"id":"69git242ktm","fromColumnIndex":21,"toColumnIndex":22,"y":2.665},{"id":"4s8yzy39wu8","fromColumnIndex":19,"toColumnIndex":20,"y":2.665},{"id":"4a6fd9zn70j","fromColumnIndex":18,"toColumnIndex":15,"y":0.615},{"id":"0u7nz9de4yj","fromColumnIndex":18,"toColumnIndex":15,"y":1.025},{"id":"l115p50nhco","fromColumnIndex":18,"toColumnIndex":15,"y":1.4349999999999998},{"id":"nmjbq2slzuo","fromColumnIndex":18,"toColumnIndex":15,"y":1.8449999999999998},{"id":"2tkb1q7jegs","fromColumnIndex":18,"toColumnIndex":15,"y":2.255},{"id":"y6bp17oz7j","fromColumnIndex":18,"toColumnIndex":15,"y":2.665},{"id":"436sgw7bxg","fromColumnIndex":17,"toColumnIndex":18,"y":2.665},{"id":"n8a6n38ejnm","fromColumnIndex":17,"toColumnIndex":16,"y":0.615},{"id":"mi9oi70cpo","fromColumnIndex":17,"toColumnIndex":16,"y":1.025},{"id":"tuejiynhi8","fromColumnIndex":17,"toColumnIndex":16,"y":1.435},{"id":"u9960jx4ul8","fromColumnIndex":17,"toColumnIndex":16,"y":1.845},{"id":"79idm97dsjh","fromColumnIndex":17,"toColumnIndex":16,"y":2.255},{"id":"x8tsm88rkif","fromColumnIndex":17,"toColumnIndex":16,"y":2.665},{"id":"xyqrv1awudb","fromColumnIndex":14,"toColumnIndex":25,"y":0.205},{"id":"ldn8848x4o9","fromColumnIndex":25,"toColumnIndex":26,"y":0.205},{"id":"wmdxd6v3ich","fromColumnIndex":26,"toColumnIndex":27,"y":0.205},{"id":"1frfumb3p11h","fromColumnIndex":27,"toColumnIndex":15,"y":0.205},{"id":"82bqfh6kn7h","fromColumnIndex":14,"toColumnIndex":25,"y":0.615},{"id":"vihp6a462a","fromColumnIndex":14,"toColumnIndex":25,"y":1.025},{"id":"3o0syrct20t","fromColumnIndex":25,"toColumnIndex":26,"y":0.615},{"id":"8hid3b5a043","fromColumnIndex":25,"toColumnIndex":26,"y":1.025},{"id":"0hd2xh39lero","fromColumnIndex":27,"toColumnIndex":15,"y":0.615},{"id":"jqk9mgkt2j","fromColumnIndex":27,"toColumnIndex":15,"y":1.025},{"id":"161jmzl0x92","fromColumnIndex":26,"toColumnIndex":27,"y":0.615},{"id":"lgrvqcs2fg","fromColumnIndex":26,"toColumnIndex":27,"y":1.025},{"id":"uakps8mvdfl","fromColumnIndex":14,"toColumnIndex":25,"y":1.4349999999999998},{"id":"lwbgrbv128l","fromColumnIndex":25,"toColumnIndex":26,"y":1.4349999999999998},{"id":"akm525hfa0b","fromColumnIndex":27,"toColumnIndex":15,"y":1.4349999999999998},{"id":"5zlbs57i8u7","fromColumnIndex":26,"toColumnIndex":27,"y":1.4349999999999998},{"id":"gkwp0jhxt6","fromColumnIndex":14,"toColumnIndex":25,"y":1.8449999999999998},{"id":"4k792xxlae7","fromColumnIndex":25,"toColumnIndex":26,"y":1.8449999999999998},{"id":"pao32wwsy7","fromColumnIndex":27,"toColumnIndex":15,"y":1.8449999999999998},{"id":"ca2odn3h97t","fromColumnIndex":26,"toColumnIndex":27,"y":1.8449999999999998},{"id":"kklr4a4a5w","fromColumnIndex":14,"toColumnIndex":25,"y":2.255},{"id":"ozu0rip9fi","fromColumnIndex":27,"toColumnIndex":15,"y":2.255},{"id":"fjeohdpi8o4","fromColumnIndex":14,"toColumnIndex":25,"y":2.665},{"id":"m767th04w5g","fromColumnIndex":25,"toColumnIndex":26,"y":2.665},{"id":"ujxqnjmyig","fromColumnIndex":27,"toColumnIndex":15,"y":2.665},{"id":"n3e8iewycqe","fromColumnIndex":26,"toColumnIndex":27,"y":2.665},{"id":"7fdo6z37le2","fromColumnIndex":12,"toColumnIndex":28,"y":0.205},{"id":"c1jp6ltyla","fromColumnIndex":28,"toColumnIndex":29,"y":0.205},{"id":"nih9f6b5gg","fromColumnIndex":29,"toColumnIndex":30,"y":0.205},{"id":"biurq3sjb7p","fromColumnIndex":30,"toColumnIndex":21,"y":0.205},{"id":"bbcs0qdq6ei","fromColumnIndex":12,"toColumnIndex":31,"y":0.205},{"id":"ff1jek8yhfm","fromColumnIndex":28,"toColumnIndex":29,"y":0.615},{"id":"avyhjmeqsxa","fromColumnIndex":28,"toColumnIndex":29,"y":1.025},{"id":"rd2p12ffafg","fromColumnIndex":12,"toColumnIndex":28,"y":0.615},{"id":"vcs9659dwu","fromColumnIndex":12,"toColumnIndex":28,"y":1.025},{"id":"b24duiylb1w","fromColumnIndex":30,"toColumnIndex":21,"y":0.615},{"id":"ticdtzupmfe","fromColumnIndex":30,"toColumnIndex":21,"y":1.025},{"id":"fbgui1e7p7f","fromColumnIndex":28,"toColumnIndex":29,"y":1.4349999999999998},{"id":"nbspreq1cb","fromColumnIndex":28,"toColumnIndex":29,"y":1.8449999999999998},{"id":"3i0e4l061ec","fromColumnIndex":12,"toColumnIndex":28,"y":1.4349999999999998},{"id":"mgktlghco1r","fromColumnIndex":12,"toColumnIndex":28,"y":1.8449999999999998},{"id":"4cmtzcqtefj","fromColumnIndex":30,"toColumnIndex":21,"y":1.4349999999999998},{"id":"g1ahbsjig","fromColumnIndex":30,"toColumnIndex":21,"y":1.8449999999999998},{"id":"l726x78yf7g","fromColumnIndex":28,"toColumnIndex":29,"y":2.255},{"id":"npqw9odfjli","fromColumnIndex":12,"toColumnIndex":28,"y":2.255},{"id":"vtauq7yjlq","fromColumnIndex":30,"toColumnIndex":21,"y":2.255},{"id":"h3k2p610v1r","fromColumnIndex":28,"toColumnIndex":29,"y":2.665},{"id":"4czl0u8mpxw","fromColumnIndex":12,"toColumnIndex":28,"y":2.665},{"id":"ys88enjyzf","fromColumnIndex":30,"toColumnIndex":21,"y":2.665},{"id":"3hk96771j6h","fromColumnIndex":29,"toColumnIndex":30,"y":2.665},{"id":"qo1k24bb6bk","fromColumnIndex":12,"toColumnIndex":31,"y":0.615},{"id":"cg3i06ltblm","fromColumnIndex":12,"toColumnIndex":31,"y":1.025},{"id":"1mxfx8fw2z7","fromColumnIndex":12,"toColumnIndex":31,"y":1.4349999999999998},{"id":"b5dsdh6p3f","fromColumnIndex":12,"toColumnIndex":31,"y":1.8449999999999998},{"id":"0zm921iz7x3","fromColumnIndex":12,"toColumnIndex":31,"y":2.255},{"id":"wi06lbykfki","fromColumnIndex":12,"toColumnIndex":31,"y":2.665},{"id":"e7fltdo2i6a","fromColumnIndex":31,"toColumnIndex":19,"y":2.665},{"id":"bit3hqrudh4","fromColumnIndex":10,"toColumnIndex":11,"y":0.615},{"id":"ghuj4c7kd8","fromColumnIndex":10,"toColumnIndex":11,"y":1.025},{"id":"h4qrtyih7pk","fromColumnIndex":10,"toColumnIndex":11,"y":1.4349999999999998},{"id":"l5xqh4hxqq","fromColumnIndex":10,"toColumnIndex":11,"y":1.8449999999999998},{"id":"30l9can8yvw","fromColumnIndex":10,"toColumnIndex":11,"y":2.255}]}`

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
  camera.position.set(6, 6, 6);

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

  const grid = createFadingGrid(MIN_COLUMN_DISTANCE, 60, 0x6b6b6b)
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

  if (showDemo) {
    loadScene(scene, state, demo)
  } else {
    state.columns.push(new Column(scene, 0, 0));
  }
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

  if (event.key === 's') {
    //console.log(saveScene(state))
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
  } else if (event.key === 'x') {
    if (state.selectedColumn && state.columns.length > 1) {
      state.columns = state.columns.filter(c => c !== state.selectedColumn);
      state.blocks = state.blocks.filter(b => !state.selectedColumn!.blocks.includes(b));
      state.selectedColumn.destroy();
    }
    for (let block of state.selectedBlocks) {
      state.blocks = state.blocks.filter(b => b !== block);
      block.destroy();
    }
    recalculate();
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
  blockRate: number;
  columnRate: number;
  workCostPerHour: number;
}

form?.addEventListener('submit', (e: Event) => {
  e.preventDefault();

  columnCost = parseFloat(columnPriceInput.value);
  blockCost = parseFloat(blockPriceInput.value);
  blockRate = parseFloat(blockRateInput.value);
  colRate = parseFloat(columnRateInput.value);
  hourCost = parseFloat(hourRateInput.value);
  hDay = parseFloat(hDayInput.value);
  dWeek = parseInt(dWeekInput.value);
  recalculate();

  modal?.classList.remove('active');
});

// Auto-start if all required URL params are present
const config = getConfiguration();
if (config) {
  BLOCK_WIDTH = config.largoBlock;
  BLOCK_HEIGHT = config.alturaBlock;
  BLOCK_DEPTH = config.anchoBlock;
  COLUMN_DEPTH = config.anchoCol;
  COLUMN_WIDTH = config.anchoCol;
  COLUMN_HEIGHT = config.alturaCol;
  MIN_COLUMN_DISTANCE = BLOCK_WIDTH + COLUMN_DEPTH;
  showDemo = config.showDemo;
  fetch('https://ntfy.sh/prefabloq3d', {
    method: 'POST', // PUT works too
    body: 'Auto-started prefabloq3d with URL parameters',
  })
  initScene();
} else {
  (document.getElementById('anchoCol')! as HTMLInputElement).value = COLUMN_WIDTH.toString();
  (document.getElementById('alturaCol')! as HTMLInputElement).value = COLUMN_HEIGHT.toString();
  (document.getElementById('anchoBlock')! as HTMLInputElement).value = BLOCK_DEPTH.toString();
  (document.getElementById('alturaBlock')! as HTMLInputElement).value = BLOCK_HEIGHT.toString();
  (document.getElementById('largoBlock')! as HTMLInputElement).value = BLOCK_WIDTH.toString();
  document.getElementById('sceneSettingsModal')!.style.display = 'grid';
}