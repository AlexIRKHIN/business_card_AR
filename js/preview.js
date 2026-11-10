// Режим предпросмотра (Ф16): та же 3D-визитка в обычной сцене Three.js,
// без камеры и маркера. Жесты, анимации и нажатия работают так же,
// как в состоянии «в руке» в AR.

import * as THREE from 'three';
import { createCard, createLights, CARD_W, CARD_H } from './card.js';
import { createCardAnimator } from './animations.js';
import { createInteraction } from './interaction.js';
import { createGestures } from './gestures.js';

const FOV = 40;
const SHIFT_UP = 0.06; // на вертикальном экране визитка чуть выше центра: внизу кнопки и подсказки

/**
 * Запускает предпросмотр в указанном контейнере.
 * @param {import('./config.js').CardConfig} config
 * @param {HTMLElement} container
 * @param {{ onFlip?: (flipped: boolean) => void, onAction?: (contact: object) => void }} [handlers]
 */
export async function startPreview(config, container, { onFlip, onAction } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.classList.add('is-preview');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
  scene.add(createLights());

  const card = await createCard(config, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
  const gestureGroup = new THREE.Group(); // поворот, масштаб и сдвиг от жестов
  gestureGroup.add(card.group);
  const holder = new THREE.Group(); // положение визитки на экране
  holder.add(gestureGroup);
  scene.add(holder);

  let cardWidthPixels = 1;

  /** Подгоняет размер и ставит камеру так, чтобы визитка помещалась целиком. */
  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const fitHeight = (CARD_H * 1.9) / 2 / halfTan;
    const fitWidth = (CARD_W * 1.25) / 2 / (halfTan * camera.aspect);
    const distance = Math.max(fitHeight, fitWidth);
    camera.position.set(0, 0, distance);
    cardWidthPixels = (CARD_W * height) / (2 * distance * halfTan);
    holder.position.y = height > width ? (height * SHIFT_UP) / cardWidthPixels : 0;
  }
  resize();
  window.addEventListener('resize', resize);

  const animator = createCardAnimator(card);
  const gestures = createGestures({ element: container, target: gestureGroup, pixelsPerUnit: () => cardWidthPixels });
  const interaction = createInteraction({ element: container, camera, card, animator, config, onFlip, onAction });
  animator.appear();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    // Ограничение шага: после сворачивания вкладки анимация не «прыгает»
    const dt = Math.min(clock.getDelta(), 0.1);
    gestures.update(dt);
    animator.update(dt);
    renderer.render(scene, camera);
  });

  return { renderer, scene, camera, card, animator, gestures, interaction };
}
