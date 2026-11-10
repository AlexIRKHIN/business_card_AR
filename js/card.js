// Построение 3D-визитки (Ф2, Ф5, Ф7). Модель создаётся программно:
// корпус со скруглёнными углами и толщиной, две грани с canvas-текстурами,
// невидимые области кнопок для raycasting и декоративная фигура.
// Модуль не зависит от режима: одна и та же визитка используется
// в предпросмотре и в AR.

import * as THREE from 'three';
import { TEX_W, TEX_H, loadCardFonts, drawFront, drawBack, layoutBack } from './card-textures.js';

/** Размеры в единицах сцены. Ширина 1 равна ширине маркера в MindAR. */
export const CARD_W = 1;
export const CARD_H = CARD_W * (50 / 90);
export const CARD_T = 0.022;
const CARD_R = 0.05;
const FACE_GAP = 0.0008; // зазор между корпусом и гранью, чтобы не было мерцания

function roundedRectShape(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.absarc(x + width - radius, y + radius, radius, -Math.PI / 2, 0);
  shape.lineTo(x + width, y + height - radius);
  shape.absarc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
  shape.lineTo(x + radius, y + height);
  shape.absarc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
  shape.lineTo(x, y + radius);
  shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
  return shape;
}

/** Плоская грань со скруглёнными углами; UV растянуты на всю текстуру. */
function createFaceGeometry(shape) {
  const geometry = new THREE.ShapeGeometry(shape, 16);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i += 1) {
    uv.setXY(i, position.getX(i) / CARD_W + 0.5, position.getY(i) / CARD_H + 0.5);
  }
  return geometry;
}

function createCanvasTexture(canvas, anisotropy) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Создаёт 3D-визитку по конфигу.
 *
 * Иерархия: group (вся визитка) → body (корпус и грани, переворачивается)
 *                                → decor (декоративная фигура, не переворачивается)
 *
 * @param {import('./config.js').CardConfig} config
 * @param {{ anisotropy?: number }} [options]
 */
export async function createCard(config, { anisotropy = 4 } = {}) {
  await loadCardFonts(`${config.name} ${config.role}`);

  const group = new THREE.Group();
  group.name = 'card';
  const body = new THREE.Group();
  body.name = 'card-body';
  group.add(body);

  // Корпус: выдавленный скруглённый прямоугольник, торцы цвета акцента
  const shape = roundedRectShape(CARD_W, CARD_H, CARD_R);
  const coreGeometry = new THREE.ExtrudeGeometry(shape, { depth: CARD_T, bevelEnabled: false, curveSegments: 16 });
  coreGeometry.translate(0, 0, -CARD_T / 2);
  const core = new THREE.Mesh(coreGeometry, [
    new THREE.MeshStandardMaterial({ color: 0x0d121c, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: config.accent, roughness: 0.35, metalness: 0.3 }),
  ]);
  body.add(core);

  // Грани с текстурами
  const faceGeometry = createFaceGeometry(shape);
  const frontCanvas = Object.assign(document.createElement('canvas'), { width: TEX_W, height: TEX_H });
  const backCanvas = Object.assign(document.createElement('canvas'), { width: TEX_W, height: TEX_H });
  const layout = layoutBack(config);
  drawFront(frontCanvas, config);
  drawBack(backCanvas, config, layout);

  const frontTexture = createCanvasTexture(frontCanvas, anisotropy);
  const backTexture = createCanvasTexture(backCanvas, anisotropy);
  // Грани светятся собственной текстурой (emissive), поэтому текст читается
  // при любом освещении и с любой стороны; свет сцены добавляет лишь лёгкий блик.
  const faceMaterial = (map) => new THREE.MeshStandardMaterial({
    map,
    color: 0x2a2a2a,
    emissive: 0xffffff,
    emissiveMap: map,
    emissiveIntensity: 0.9,
    roughness: 0.45,
    metalness: 0.1,
  });

  const front = new THREE.Mesh(faceGeometry, faceMaterial(frontTexture));
  front.name = 'card-front';
  front.position.z = CARD_T / 2 + FACE_GAP;

  const back = new THREE.Mesh(faceGeometry, faceMaterial(backTexture));
  back.name = 'card-back';
  back.position.z = -(CARD_T / 2 + FACE_GAP);
  back.rotation.y = Math.PI;
  body.add(front, back);

  // Невидимые области кнопок на обратной стороне: по ним raycasting
  // определяет, какую кнопку нажал пользователь (Ф8).
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const buttons = layout.map(({ contact, x, y, w, h }) => {
    const width = (w / TEX_W) * CARD_W;
    const height = (h / TEX_H) * CARD_H;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), hitMaterial);
    mesh.name = `button-${contact.id}`;
    mesh.position.set(
      ((x + w / 2) / TEX_W - 0.5) * CARD_W,
      (0.5 - (y + h / 2) / TEX_H) * CARD_H,
      0.001,
    );
    mesh.userData.contact = contact;
    back.add(mesh);
    return { contact, mesh };
  });

  const decor = createDecor(config.accent);
  decor.position.set(CARD_W * 0.4, CARD_H * 0.62, 0.1);
  group.add(decor);

  let highlighted = null;

  return {
    group,
    body,
    front,
    back,
    buttons,
    decor,

    /** Подсвечивает кнопку обратной стороны; null снимает подсветку. */
    setHighlight(contactId) {
      if (contactId === highlighted) return;
      highlighted = contactId;
      drawBack(backCanvas, config, layout, contactId);
      backTexture.needsUpdate = true;
    },

    /** Освобождает геометрию, материалы и текстуры. */
    dispose() {
      group.traverse((object) => {
        object.geometry?.dispose();
        for (const material of [].concat(object.material ?? [])) material.dispose();
      });
      frontTexture.dispose();
      backTexture.dispose();
    },
  };
}

/** Декоративная фигура: гранёный кристалл цвета акцента в каркасной оболочке. */
function createDecor(accent) {
  const decor = new THREE.Group();
  decor.name = 'card-decor';

  const crystal = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.07, 0),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.25, metalness: 0.45, flatShading: true }),
  );
  crystal.name = 'decor-crystal';

  const shell = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.105, 0)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
  );
  shell.name = 'decor-shell';

  decor.add(crystal, shell);
  return decor;
}

/** Освещение сцены, общее для предпросмотра и AR. */
export function createLights() {
  const lights = new THREE.Group();
  lights.name = 'lights';
  const sky = new THREE.HemisphereLight(0xffffff, 0x55607a, 2.2);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.6, 1.2, 2);
  lights.add(sky, key);
  return lights;
}
