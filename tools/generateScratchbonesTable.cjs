#!/usr/bin/env node
'use strict';
/**
 * generateScratchbonesTable.js
 * Produces ScratchbonesTableV1.gltf at the repo root.
 *
 * Node hierarchy:
 *   ExportRoot
 *   ├── FOUNDATION          (mesh 0: dark 10×0.25×7 table top)
 *   ├── ui_plane:ui:base    (mesh 1: 1.6×0.9 quad, BLEND)
 *   ├── ui_plane:ui:playerlist (mesh 1: shared quad)
 *   └── placeholder:ownedslot:1 … 14  (mesh 2: 7.0×0.892×1.64 slot bounds)
 */

const fs   = require('fs');
const path = require('path');

// ─── geometry helpers ────────────────────────────────────────────────────────

/** Full box mesh – 6 faces, 24 verts, 36 indices */
function boxGeo(w, h, d) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const pos = [], nrm = [], uv = [], idx = [];
  const faces = [
    { n: [ 0, 1, 0], v: [[-hw,hh,-hd],[hw,hh,-hd],[hw,hh,hd],[-hw,hh,hd]] },
    { n: [ 0,-1, 0], v: [[-hw,-hh,hd],[hw,-hh,hd],[hw,-hh,-hd],[-hw,-hh,-hd]] },
    { n: [ 0, 0, 1], v: [[-hw,-hh,hd],[hw,-hh,hd],[hw,hh,hd],[-hw,hh,hd]] },
    { n: [ 0, 0,-1], v: [[hw,-hh,-hd],[-hw,-hh,-hd],[-hw,hh,-hd],[hw,hh,-hd]] },
    { n: [ 1, 0, 0], v: [[hw,-hh,hd],[hw,-hh,-hd],[hw,hh,-hd],[hw,hh,hd]] },
    { n: [-1, 0, 0], v: [[-hw,-hh,-hd],[-hw,-hh,hd],[-hw,hh,hd],[-hw,hh,-hd]] },
  ];
  let base = 0;
  for (const f of faces) {
    for (const [vx, vy, vz] of f.v) { pos.push(vx, vy, vz); nrm.push(...f.n); }
    uv.push(0,0, 1,0, 1,1, 0,1);
    idx.push(base, base+1, base+2,  base, base+2, base+3);
    base += 4;
  }
  return { pos, nrm, uv, idx, vtxCount: base, idxCount: idx.length };
}

/** UI plane quad – exactly as specified in the brief */
function quadGeo() {
  //  v0  v1
  //  v2  v3
  const pos = [-0.8, 0.45, 0,   0.8, 0.45, 0,
               -0.8,-0.45, 0,   0.8,-0.45, 0];
  const nrm = [0,0,1, 0,0,1, 0,0,1, 0,0,1];
  const uv  = [0,1, 1,1, 0,0, 1,0];
  const idx = [0,2,1, 2,3,1];                // tris per brief
  return { pos, nrm, uv, idx, vtxCount: 4, idxCount: 6 };
}

// ─── buffer packing ──────────────────────────────────────────────────────────

function packGeo(geo) {
  const pa = new Float32Array(geo.pos);
  const na = new Float32Array(geo.nrm);
  const ua = new Float32Array(geo.uv);
  const ia = new Uint16Array(geo.idx);

  const align4 = n => (n + 3) & ~3;

  const posOff = 0;
  const nrmOff = posOff + pa.byteLength;
  const uvOff  = nrmOff + na.byteLength;
  const idxOff = align4(uvOff + ua.byteLength);
  const total  = align4(idxOff + ia.byteLength);

  const buf = Buffer.alloc(total, 0);
  Buffer.from(pa.buffer).copy(buf, posOff);
  Buffer.from(na.buffer).copy(buf, nrmOff);
  Buffer.from(ua.buffer).copy(buf, uvOff);
  Buffer.from(ia.buffer).copy(buf, idxOff);

  return { buf, total, posOff, nrmOff, uvOff, idxOff,
           posLen: pa.byteLength, nrmLen: na.byteLength,
           uvLen: ua.byteLength,  idxLen: ia.byteLength };
}

// ─── min/max for POSITION accessor (required by spec) ───────────────────────

function posMinMax(geo) {
  let mnX=Infinity, mnY=Infinity, mnZ=Infinity;
  let mxX=-Infinity, mxY=-Infinity, mxZ=-Infinity;
  for (let i = 0; i < geo.pos.length; i += 3) {
    mnX = Math.min(mnX, geo.pos[i]);   mxX = Math.max(mxX, geo.pos[i]);
    mnY = Math.min(mnY, geo.pos[i+1]); mxY = Math.max(mxY, geo.pos[i+1]);
    mnZ = Math.min(mnZ, geo.pos[i+2]); mxZ = Math.max(mxZ, geo.pos[i+2]);
  }
  return { min: [mnX, mnY, mnZ], max: [mxX, mxY, mxZ] };
}

// ─── GLTF builder ────────────────────────────────────────────────────────────

function buildGLTF() {
  const foundGeo = boxGeo(10, 0.25, 7);
  const quad     = quadGeo();
  const slotGeo  = boxGeo(7.0, 0.892, 1.64);   // per brief – runtime hides & replaces

  const packs = [packGeo(foundGeo), packGeo(quad), packGeo(slotGeo)];

  // Single combined buffer
  const gBase = [0];
  for (let i = 0; i < packs.length - 1; i++) gBase.push(gBase[i] + packs[i].total);
  const combined = Buffer.concat(packs.map(p => p.buf));
  const uri = `data:application/octet-stream;base64,${combined.toString('base64')}`;

  const bufferViews = [];
  const accessors   = [];

  function addMesh(geoIdx, geo, pack) {
    const g = gBase[geoIdx];
    const bvPos = bufferViews.length;
    bufferViews.push({ buffer:0, byteOffset:g+pack.posOff, byteLength:pack.posLen, target:34962 });
    const bvNrm = bufferViews.length;
    bufferViews.push({ buffer:0, byteOffset:g+pack.nrmOff, byteLength:pack.nrmLen, target:34962 });
    const bvUV  = bufferViews.length;
    bufferViews.push({ buffer:0, byteOffset:g+pack.uvOff,  byteLength:pack.uvLen,  target:34962 });
    const bvIdx = bufferViews.length;
    bufferViews.push({ buffer:0, byteOffset:g+pack.idxOff, byteLength:pack.idxLen, target:34963 });

    const { min, max } = posMinMax(geo);
    const aPos = accessors.length;
    accessors.push({ bufferView:bvPos, byteOffset:0, componentType:5126, count:geo.vtxCount, type:'VEC3', min, max });
    const aNrm = accessors.length;
    accessors.push({ bufferView:bvNrm, byteOffset:0, componentType:5126, count:geo.vtxCount, type:'VEC3' });
    const aUV  = accessors.length;
    accessors.push({ bufferView:bvUV,  byteOffset:0, componentType:5126, count:geo.vtxCount, type:'VEC2' });
    const aIdx = accessors.length;
    accessors.push({ bufferView:bvIdx, byteOffset:0, componentType:5123, count:geo.idxCount, type:'SCALAR' });
    return { aPos, aNrm, aUV, aIdx };
  }

  const fa = addMesh(0, foundGeo, packs[0]);
  const qa = addMesh(1, quad,     packs[1]);
  const sa = addMesh(2, slotGeo,  packs[2]);

  const materials = [
    {
      name: 'FoundationMat',
      pbrMetallicRoughness: {
        baseColorFactor: [0.082, 0.082, 0.082, 1.0],
        metallicFactor: 0.0, roughnessFactor: 0.9,
      },
    },
    {
      name: 'UIPlaneMat',
      alphaMode: 'BLEND',
      pbrMetallicRoughness: {
        baseColorFactor: [1.0, 1.0, 1.0, 0.35],
        metallicFactor: 0.0, roughnessFactor: 1.0,
      },
    },
  ];

  const prim = (a, matIdx) => ({
    attributes: { POSITION: a.aPos, NORMAL: a.aNrm, TEXCOORD_0: a.aUV },
    indices: a.aIdx,
    material: matIdx,
    mode: 4,
  });

  const meshes = [
    { name: 'FoundationMesh', primitives: [prim(fa, 0)] },
    { name: 'UIPlaneMesh',    primitives: [prim(qa, 1)] },
    { name: 'SlotMesh',       primitives: [prim(sa, 0)] },
  ];

  // Node 0 = ExportRoot, children = nodes 1..16
  const childList = Array.from({ length: 16 }, (_, i) => i + 1);
  const nodes = [
    { name: 'ExportRoot', children: childList },
    { name: 'FOUNDATION',                mesh: 0 },
    { name: 'ui_plane:ui:base',           mesh: 1 },
    { name: 'ui_plane:ui:playerlist',     mesh: 1 },
    ...Array.from({ length: 14 }, (_, i) => ({
      name: `placeholder:ownedslot:${i + 1}`,
      mesh: 2,
    })),
  ];

  return {
    asset: { version: '2.0', generator: 'ScratchbonesTableGen v1' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [0] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ uri, byteLength: combined.byteLength }],
  };
}

// ─── write ────────────────────────────────────────────────────────────────────

const gltf    = buildGLTF();
const outPath = path.resolve(__dirname, '../ScratchbonesTableV1.gltf');
fs.writeFileSync(outPath, JSON.stringify(gltf, null, 2), 'utf8');
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Written: ${outPath}  (${kb} KB)`);
