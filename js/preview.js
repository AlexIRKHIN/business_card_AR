// Режим предпросмотра (Ф16): та же 3D-визитка в обычной сцене Three.js,
// без камеры и маркера. Визитку можно вращать мышью или пальцем,
// анимации и нажатия работают так же, как в AR.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCard, createLights, CARD_W, CARD_H } from './card.js';
import { createCardAnimator } from './animations.js';
import { createInteraction } from './interaction.js';

const FOV = 40;

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
  scene.add(card.group);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.8;

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

    const direction = camera.position.lengthSq() > 0
      ? camera.position.clone().normalize()
      : new THREE.Vector3(0, 0, 1);
    camera.position.copy(direction.multiplyScalar(distance));
    controls.minDistance = distance * 0.6;
    controls.maxDistance = distance * 1.8;
    controls.update();
  }
  resize();
  window.addEventListener('resize', resize);

  const animator = createCardAnimator(card);
  const interaction = createInteraction({ element: container, camera, card, animator, config, onFlip, onAction });
  animator.appear();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    // Ограничение шага: после сворачивания вкладки анимация не «прыгает»
    animator.update(Math.min(clock.getDelta(), 0.1));
    controls.update();
    renderer.render(scene, camera);
  });

  return { renderer, scene, camera, controls, card, animator, interaction };
}
