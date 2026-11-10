// Живой предпросмотр 3D-визитки в конструкторе. Визитка строится тем же
// кодом, что и в приложении (card.js, animations.js, gestures.js,
// interaction.js), и пересобирается при каждом изменении данных.

import * as THREE from 'three';
import { createCard, createLights, CARD_W, CARD_H } from '../js/card.js';
import { createCardAnimator } from '../js/animations.js';
import { createInteraction } from '../js/interaction.js';
import { createGestures } from '../js/gestures.js';

const FOV = 40;

/**
 * @param {HTMLElement} container
 * @param {{ onAction?: (contact: object) => void }} [handlers]
 */
export function createViewer(container, { onAction } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
  scene.add(createLights());
  const gestureGroup = new THREE.Group(); // поворот и масштаб от жестов
  scene.add(gestureGroup);

  let cardWidthPixels = 1;
  let current = null;   // { card, animator, interaction }
  let buildNumber = 0;  // номер последней запрошенной сборки

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const fitHeight = (CARD_H * 1.75) / 2 / halfTan;
    const fitWidth = (CARD_W * 1.3) / 2 / (halfTan * camera.aspect);
    const distance = Math.max(fitHeight, fitWidth);
    camera.position.set(0, 0.03, distance);
    cardWidthPixels = (CARD_W * height) / (2 * distance * halfTan);
  }
  resize();
  new ResizeObserver(resize).observe(container);

  // Колесо мыши здесь прокручивает страницу, поэтому масштаб им не меняется
  const gestures = createGestures({
    element: container,
    target: gestureGroup,
    pixelsPerUnit: () => cardWidthPixels,
    wheel: false,
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    gestures.update(dt);
    current?.animator.update(dt);
    renderer.render(scene, camera);
  });

  return {
    /**
     * Пересобирает визитку по новым данным. Сторона, которой визитка
     * повёрнута к зрителю, сохраняется.
     * @param {import('../js/config.js').CardConfig} config
     */
    async setConfig(config) {
      const number = ++buildNumber;
      const card = await createCard(config, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
      if (number !== buildNumber) {
        card.dispose(); // пока визитка строилась, данные изменились ещё раз
        return;
      }

      const first = !current;
      const flipped = current?.animator.isFlipped ?? false;
      if (current) {
        current.interaction.dispose();
        gestureGroup.remove(current.card.group);
        current.card.dispose();
      }

      const animator = createCardAnimator(card, { appeared: !first, flipped });
      const interaction = createInteraction({ element: container, camera, card, animator, config, onAction });
      gestureGroup.add(card.group);
      current = { card, animator, interaction };
    },
  };
}
