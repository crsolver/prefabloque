import * as THREE from 'three';
import { State } from "./main";
import { Column } from './column';
import { Block } from './block';

interface SerializedBlock {
  id: string;
  fromColumnIndex: number;
  toColumnIndex: number;
  y: number;
}

interface SerializedColumn {
  x: number;
  z: number;
}

interface SerializedScene {
  columns: SerializedColumn[];
  blocks: SerializedBlock[];
}

export function saveScene(state: State): string {
  const serialized: SerializedScene = {
    columns: state.columns.map(col => ({
      x: col.position.x,
      z: col.position.z
    })),
    blocks: state.blocks.map(block => ({
      id: block.id,
      fromColumnIndex: state.columns.indexOf(block.fromColumn),
      toColumnIndex: state.columns.indexOf(block.toColumn),
      y: block.position.y
    }))
  };
  
  return JSON.stringify(serialized);
}

export function loadScene(scene: THREE.Scene, state: State, data: string): void {
	// todo: destroy existing
  state.columns = [];
  state.blocks = [];
  
  // Load new scene
  const serialized: SerializedScene = JSON.parse(data);
  
  // Create columns
  serialized.columns.forEach(colData => {
    const column = new Column(scene, colData.x, colData.z);
    state.columns.push(column);
  });
  
  // Create blocks
  serialized.blocks.forEach(blockData => {
    const fromColumn = state.columns[blockData.fromColumnIndex];
    const toColumn = state.columns[blockData.toColumnIndex];
    const block = new Block(scene, fromColumn, toColumn, blockData.y);
    state.blocks.push(block);
  });
}