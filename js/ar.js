// AR-режим (Ф1, Ф3, Ф14, Ф18–Ф22). MindAR распознаёт изображение-маркер
// в кадре камеры и сообщает его положение. Визитка живёт в одном из двух
// состояний:
//   «на маркере» — следует за печатной визиткой (со сглаживанием);
//   «в руке»     — режим осмотра: закреплена в центре экрана, не зависит
//                  от маркера и управляется жестами.
// В руку визитка переходит по кнопке «Осмотреть визитку» или при потере
// маркера, обратно — по кнопке «Вернуть на визитку». Сторона визитки
// при переходах не меняется: нажатие всегда только переворачивает её.

import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { createCard, createLights, CARD_H } from './card.js';
import { createCardAnimator } from './animations.js';
import { createInteraction } from './interaction.js';
import { createGestures } from './gestures.js';

const TARGET_SRC = 'assets/targets.mind';

/** Высота парения визитки над маркером (в ширинах маркера). */
const HOVER_HEIGHT = 0.06;

/** Длительность перелёта между маркером и рукой, секунды. */
const TRANSITION_TIME = 0.7;

/** Размер визитки в руке: доля ширины и высоты экрана, которую она может занять. */
const HAND_WIDTH = 0.9;
const HAND_HEIGHT = 0.5;
const HAND_SHIFT_UP = 0.03; // сдвиг вверх от центра, в долях высоты экрана

/**
 * Сглаживание положения на маркере (Ф22). Скорость следования зависит от
 * расхождения с маркером: мелкое дрожание гасится сильно (SLOW), а за
 * настоящим движением визитка успевает (FAST).
 */
const SMOOTH = {
  positionSlow: 5,
  positionFast: 40,
  positionRange: 0.25, // расхождение в ширинах визитки, при котором скорость максимальна
  rotationSlow: 4,
  rotationFast: 30,
  rotationRange: 0.5,  // то же для угла, радианы
};

/**
 * Настройки MindAR: сколько кадров подряд маркер должен быть найден до
 * показа и сколько кадров может быть потерян до события потери.
 */
const TRACKING = { warmupTolerance: 3, missTolerance: 10 };

/** Сколько ждать запуска камеры и трекинга, прежде чем сообщить об ошибке. */
const START_TIMEOUT = 45_000; // миллисекунд

const TRACKING_ERROR = 'Не получилось загрузить данные для распознавания визитки. Проверьте подключение к интернету и попробуйте снова.';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

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
function cleanup(ar, container) {
  ar.video?.srcObject?.getTracks().forEach((track) => track.stop());
  ar.video?.remove();
  ar.video = null;
  ar.renderer.setAnimationLoop(null);
  ar.renderer.domElement.remove();
  ar.cssRenderer.domElement.remove();
  ar.renderer.dispose();
  container.classList.remove('is-ar');
}

/** Положение объекта: точка, поворот и общий масштаб. */
function createPose() {
  return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 };
}

function copyPose(target, source) {
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale = source.scale;
}

/**
 * Запускает AR-режим в указанном контейнере.
 *
 * @param {import('./config.js').CardConfig} config
 * @param {HTMLElement} container
 * @param {object} [handlers]
 * @param {(state: { mode: 'scanning'|'marker'|'hand', markerVisible: boolean }) => void} [handlers.onState]
 * @param {(flipped: boolean) => void} [handlers.onFlip]
 * @param {(contact: object) => void} [handlers.onAction]
 */
export async function startAR(config, container, { onState, onFlip, onAction } = {}) {
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
  // Единица длины внутри якоря равна ширине маркера.
  const anchor = ar.addAnchor(0);

  let card;
  try {
    card = await createCard(config, { anisotropy: ar.renderer.capabilities.getMaxAnisotropy() });
  } catch (error) {
    cleanup(ar, container);
    throw error;
  }

  // Визитка не вложена в якорь: её положение рассчитывается в приложении.
  //   holder — положение в сцене: сглаженный маркер или точка перед камерой
  //   gestureGroup — поворот, масштаб и сдвиг от жестов пользователя
  const holder = new THREE.Group();
  holder.name = 'card-holder';
  holder.visible = false;
  const gestureGroup = new THREE.Group();
  gestureGroup.name = 'card-gestures';
  gestureGroup.add(card.group);
  holder.add(gestureGroup);
  ar.scene.add(holder, createLights());

  /** @type {'scanning'|'marker'|'hand'} */
  let mode = 'scanning';
  let markerVisible = false;
  let transition = 1;             // 1 — перелёт завершён
  let handWidthPixels = 1;        // ширина визитки в руке на экране

  const currentPose = createPose();
  const fromPose = createPose();   // откуда начался перелёт
  const markerPose = createPose(); // последнее известное положение маркера
  const handPose = createPose();   // точка перед камерой
  const scratchScale = new THREE.Vector3();
  const scratchAxis = new THREE.Vector3();

  const emitState = () => onState?.({ mode, markerVisible });

  /** Читает положение маркера из якоря и поднимает точку на высоту парения. */
  function readMarkerPose() {
    anchor.group.matrix.decompose(markerPose.position, markerPose.quaternion, scratchScale);
    markerPose.scale = scratchScale.x;
    scratchAxis.set(0, 0, 1).applyQuaternion(markerPose.quaternion);
    markerPose.position.addScaledVector(scratchAxis, HOVER_HEIGHT * markerPose.scale);
  }

  /**
   * Рассчитывает положение «в руке»: точка прямо перед камерой, размер
   * подобран так, чтобы визитка занимала заданную долю экрана.
   */
  function computeHandPose() {
    const { camera } = ar;
    const viewWidth = container.clientWidth;
    const viewHeight = container.clientHeight;
    const distance = Math.sqrt(camera.near * camera.far); // середина диапазона глубины
    const unitsPerPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / viewHeight;

    handWidthPixels = Math.min(viewWidth * HAND_WIDTH, (viewHeight * HAND_HEIGHT) / CARD_H);
    handPose.scale = handWidthPixels * unitsPerPixel;
    handPose.position.set(0, viewHeight * HAND_SHIFT_UP * unitsPerPixel, -distance);
    handPose.quaternion.identity();
  }

  /** Начинает перелёт из текущего положения к цели нового состояния. */
  function startTransition(nextMode) {
    mode = nextMode;
    copyPose(fromPose, currentPose);
    transition = 0;
    emitState();
  }

  /** Переводит визитку в режим осмотра (Ф19). false — визитки на маркере нет. */
  function toHand() {
    if (mode !== 'marker') return false;
    startTransition('hand');
    return true;
  }

  /** Возвращает визитку на маркер (Ф21). false — маркера нет в кадре. */
  function toMarker() {
    if (mode !== 'hand' || !markerVisible) return false;
    gestures.reset(); // поворот и масштаб от жестов плавно сбрасываются
    startTransition('marker');
    return true;
  }

  /** Экспоненциальное сглаживание с переменной скоростью (Ф22). */
  function followMarker(dt) {
    const distance = currentPose.position.distanceTo(markerPose.position) / markerPose.scale;
    const positionSpeed = THREE.MathUtils.lerp(
      SMOOTH.positionSlow, SMOOTH.positionFast, Math.min(1, distance / SMOOTH.positionRange),
    );
    const positionFollow = 1 - Math.exp(-dt * positionSpeed);
    currentPose.position.lerp(markerPose.position, positionFollow);
    currentPose.scale += (markerPose.scale - currentPose.scale) * positionFollow;

    const angle = currentPose.quaternion.angleTo(markerPose.quaternion);
    const rotationSpeed = THREE.MathUtils.lerp(
      SMOOTH.rotationSlow, SMOOTH.rotationFast, Math.min(1, angle / SMOOTH.rotationRange),
    );
    currentPose.quaternion.slerp(markerPose.quaternion, 1 - Math.exp(-dt * rotationSpeed));
  }

  function updatePose(dt) {
    if (mode === 'scanning') return;
    if (markerVisible) readMarkerPose();
    const target = mode === 'marker' ? markerPose : handPose;

    if (transition < 1) {
      // Перелёт: плавная интерполяция от точки старта к цели
      transition = Math.min(1, transition + dt / TRANSITION_TIME);
      const t = easeInOutCubic(transition);
      currentPose.position.lerpVectors(fromPose.position, target.position, t);
      currentPose.quaternion.slerpQuaternions(fromPose.quaternion, target.quaternion, t);
      currentPose.scale = fromPose.scale + (target.scale - fromPose.scale) * t;
    } else if (mode === 'marker') {
      followMarker(dt);
    } else {
      copyPose(currentPose, handPose);
    }

    holder.position.copy(currentPose.position);
    holder.quaternion.copy(currentPose.quaternion);
    holder.scale.setScalar(currentPose.scale);
  }

  // В AR визитка «выезжает» из печатной: поднимается от плоскости маркера
  const animator = createCardAnimator(card, { rise: { y: -0.04, z: -HOVER_HEIGHT } });
  const gestures = createGestures({
    element: container,
    target: gestureGroup,
    isEnabled: () => mode === 'hand',
    pixelsPerUnit: () => handWidthPixels,
  });
  const interaction = createInteraction({
    element: container,
    camera: ar.camera,
    card,
    animator,
    config,
    isActive: () => mode !== 'scanning',
    onFlip,
    onAction,
  });

  anchor.onTargetFound = () => {
    markerVisible = true;
    if (mode === 'scanning') {
      // Первое обнаружение: визитка появляется прямо на маркере (Ф3)
      readMarkerPose();
      copyPose(currentPose, markerPose);
      mode = 'marker';
      holder.visible = true;
      animator.appear();
    }
    emitState();
  };
  anchor.onTargetLost = () => {
    markerVisible = false;
    // Маркер ушёл из кадра — визитка остаётся у пользователя (Ф19)
    if (mode === 'marker') toHand();
    else emitState();
  };

  try {
    await withTimeout(ar.start(), START_TIMEOUT);
  } catch (error) {
    interaction.dispose();
    gestures.dispose();
    card.dispose();
    cleanup(ar, container);
    if (error) {
      // Камера включилась, но не запустился сам трекинг
      console.error(error);
      throw new ARError('Не удалось запустить AR', TRACKING_ERROR);
    }
    throw new ARError('Камера недоступна', await describeCameraError());
  }

  computeHandPose();
  window.addEventListener('resize', computeHandPose); // после пересчёта камеры в MindAR

  const clock = new THREE.Clock();
  ar.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    updatePose(dt);
    gestures.update(dt);
    animator.update(dt);
    ar.renderer.render(ar.scene, ar.camera);
  });

  // После возврата на вкладку (например, из звонилки или Telegram)
  // видео с камеры может остаться на паузе
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ar.video?.paused) ar.video.play().catch(() => {});
  });

  emitState();
  return {
    /** Переводит визитку в режим осмотра; false, если она не на маркере. */
    inspect: toHand,
    /** Возвращает визитку на маркер; false, если маркера нет в кадре. */
    returnToMarker: toMarker,
    get mode() { return mode; },
    ar, card, animator, gestures, interaction,
  };
}
