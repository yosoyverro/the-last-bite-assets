import fs from 'node:fs';
import path from 'node:path';

const dir = 'models/gameplay items';
const files = fs.readdirSync(dir).filter(name => name.endsWith('.glb')).sort();

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not GLB');
  const version = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);
  if (version !== 2 || length !== buf.length) throw new Error(`bad header v${version} len=${length}/${buf.length}`);
  let offset = 12;
  let json = null;
  while (offset + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4E4F534A) json = JSON.parse(body.toString('utf8').replace(/\u0000+$/g, '').trim());
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error('missing JSON chunk');
  return { buf, json };
}

let failed = false;
for (const name of files) {
  const file = path.join(dir, name);
  try {
    const { buf, json } = readGlb(file);
    const images = json.images ?? [];
    const textures = json.textures ?? [];
    const materials = json.materials ?? [];
    const baseColor = materials.filter(m => Number.isInteger(m?.pbrMetallicRoughness?.baseColorTexture?.index)).length;
    const embedded = images.filter(i => Number.isInteger(i.bufferView)).length;
    const external = images.filter(i => typeof i.uri === 'string').map(i => i.uri);
    const mimes = [...new Set(images.map(i => i.mimeType).filter(Boolean))];
    const used = json.extensionsUsed ?? [];
    const required = json.extensionsRequired ?? [];
    const report = {
      file: name,
      bytes: buf.length,
      images: images.length,
      embeddedImages: embedded,
      externalImages: external,
      mimeTypes: mimes,
      textures: textures.length,
      materials: materials.length,
      baseColorTexturedMaterials: baseColor,
      extensionsUsed: used,
      extensionsRequired: required,
    };
    console.log(JSON.stringify(report));
    if (!images.length || !textures.length || !baseColor) {
      console.error(`AUDIT_FAIL ${name}: missing embedded base-color texture data`);
      failed = true;
    }
    if (external.length) {
      console.error(`AUDIT_FAIL ${name}: external image URIs: ${external.join(', ')}`);
      failed = true;
    }
  } catch (error) {
    console.error(`AUDIT_FAIL ${name}: ${error.message}`);
    failed = true;
  }
}
if (failed) process.exit(1);


for (const file of ['models/boy/boy-swat.glb','models/girl/girl-swat.glb']) {
  try {
    const { buf, json } = readGlb(file);
    const animations = json.animations ?? [];
    const channels = animations.flatMap(a => a.channels ?? []);
    const nodes = json.nodes ?? [];
    const targets = channels.map(ch => ({
      node: ch?.target?.node,
      name: nodes[ch?.target?.node]?.name ?? null,
      path: ch?.target?.path ?? null,
    }));
    console.log(JSON.stringify({
      file,
      bytes: buf.length,
      animations: animations.length,
      animationNames: animations.map(a => a.name ?? null),
      channels: channels.length,
      targetSample: targets.slice(0, 20),
    }));
    if (!animations.length || !channels.length) {
      console.error(`AUDIT_FAIL ${file}: no usable animation channels`);
      failed = true;
    }
  } catch (error) {
    console.error(`AUDIT_FAIL ${file}: ${error.message}`);
    failed = true;
  }
}
