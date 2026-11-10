// AR-режим (Ф1, Ф3, Ф14): MindAR распознаёт изображение-маркер в кадре
// камеры и передаёт его положение, а 3D-визитка привязывается к маркеру.

import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { createCard, createLights } from './card.js';
import { createCardAnimator } from './animations.js';
import { createInteraction } from './interaction.js';

const TARGET_SRC = 'assets/targets.mind';

/** Высота парения визитки над маркером (в ширинах маркера). */
const HOVER_HEIGHT = 0.14;

/** Если маркер пропал меньше чем на это время, появление заново не проигрывается. */
const REAPPEAR_DELAY = 1200; // миллисекунд

/**
 * Настройки трекинга MindAR.
 * filterMinCF и filterBeta — параметры сглаживающего фильтра: меньший
 * filterMinCF сильнее гасит дрожание, больший filterBeta уменьшает отставание.
 * warmupTolerance — сколько кадров подряд маркер должен быть найден до показа,
 * missTolerance — сколько кадров подряд он может быть потерян до скрытия.
 */
const TRACKING = {
  filterMinCF: 0.0004,
  filterBeta: 1000,
  warmupTolerance: 3,
  missTolerance: 10,
};

/** Сколько ждать запуска камеры и трекинга, прежде чем сообщить об ошибке. */
const START_TIMEOUT = 45_000; // миллисекунд

const TRACKING_ERROR = 'Не получилось загрузить данные для распознавания визитки. Проверьте подключение к интернету и попробуйте снова.';

/** Ошибка запуска AR с заголовком и текстом для пользователя (Ф14). */
export class ARError extends Error {
  constructor(title, message) {
    super(message);
    this.title = title;
  }
}

/**
 * Выясняет, почему не удалось получить доступ к камере.
 * MindAR не сообщает причину, поэтому камера запрашивается повторно.
 */
async function describeCameraError() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return 'Не удалось включить основную камеру устройства. Обновите страницу и попробуйте снова.';
  } catch (error) {
    console.warn('Камера недоступна:', error?.name, error?.message);
    switch (error?.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Доступ к камере запрещён. Разрешите его в настройках сайта в браузере и попробуйте снова.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'На этом устройстве не найдена камера.';
      case 'NotReadableError':
      case 'AbortError':
        return 'Камера занята другим приложением. Закройте его и попробуйте снова.';
      default:
        return 'Не удалось получить доступ к камере.';
    }
  }
}

/** Отклоняет промис, если он не завершился за отведённое время. */
function withTimeout(promise, milliseconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), milliseconds);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Убирает со страницы всё, что успел создать MindAR, если запуск не удался. */
function cleanup(ar) {
  ar.video?.srcObject?.getTracks().forEach((track) => track.stop());
  ar.video?.remove();
  ar.video = null;
  ar.renderer.setAnimationLoop(null);
  ar.renderer.domElement.remove();
  ar.cssRenderer.domElement.remove();
  ar.renderer.dispose();
}

/**
 * Запускает AR-режим в указанном контейнере.
 *
 * @param {import('./config.js').CardConfig} config
 * @param {HTMLElement} container
 * @param {object} [handlers]
 * @param {() => void} [handlers.onTargetFound]
 * @param {() => void} [handlers.onTargetLost]
 * @param {(flipped: boolean) => void} [handlers.onFlip]
 * @param {(contact: object) => void} [handlers.onAction]
 */
export async function startAR(config, container, { onTargetFound, onTargetLost, onFlip, onAction } = {}) {
  // Файл трекинга проверяется заранее: если его нет, MindAR не сообщает
  // об ошибке, а запуск просто не завершается.
  const targetResponse = await fetch(TARGET_SRC).catch(() => null);
  if (!targetResponse?.ok) throw new ARError('Не удалось запустить AR', TRACKING_ERROR);

  const ar = new MindARThree({
    container,
    imageTargetSrc: TARGET_SRC,
    maxTrack: 1,
    uiLoading: 'no',   // собственные экраны загрузки, подсказок и ошибок (ui.js)
    uiScanning: 'no',
    uiError: 'no',
    ...TRACKING,
  });
  ar.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.classList.add('is-ar');

  // Якорь: группа, которой MindAR в каждом кадре задаёт положение маркера.
  // Единица длины внутри якоря равна ширине маркера, поэтому визитка
  // шириной 1 точно накрывает печатную.
  const anchor = ar.addAnchor(0);
  let card;
  try {
    card = await createCard(config, { anisotropy: ar.renderer.capabilities.getMaxAnisotropy() });
  } catch (error) {
    cleanup(ar);
    container.classList.remove('is-ar');
    throw error;
  }
  card.group.position.z = HOVER_HEIGHT;
  anchor.group.add(card.group);
  ar.scene.add(createLights());

  // В AR визитка «выезжает» из печатной: поднимается от плоскости маркера
  const animator = createCardAnimator(card, { rise: { y: -0.06, z: -HOVER_HEIGHT } });
  const interaction = createInteraction({
    element: container,
    camera: ar.camera,
    card,
    animator,
    config,
    isActive: () => anchor.group.visible,
    onFlip,
    onAction,
  });

  let lostAt = -Infinity;
  anchor.onTargetFound = () => {
    if (performance.now() - lostAt > REAPPEAR_DELAY) animator.appear(); // Ф3
    onTargetFound?.();
  };
  anchor.onTargetLost = () => {
    lostAt = performance.now();
    card.setHighlight(null);
    onTargetLost?.();
  };

  try {
    await withTimeout(ar.start(), START_TIMEOUT);
  } catch (error) {
    interaction.dispose();
    card.dispose();
    cleanup(ar);
    container.classList.remove('is-ar');
    if (error) {
      // Камера включилась, но не запустился сам трекинг
      console.error(error);
      throw new ARError('Не удалось запустить AR', TRACKING_ERROR);
    }
    throw new ARError('Камера недоступна', await describeCameraError());
  }

  const clock = new THREE.Clock();
  ar.renderer.setAnimationLoop(() => {
    animator.update(Math.min(clock.getDelta(), 0.1));
    ar.renderer.render(ar.scene, ar.camera);
  });

  // После возврата на вкладку (например, из звонилки или Telegram)
  // видео с камеры может остаться на паузе
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ar.video?.paused) ar.video.play().catch(() => {});
  });

  return { ar, anchor, card, animator, interaction };
}
