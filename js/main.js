// Точка входа: загружает конфиг, показывает интерфейс и выбирает режим
// работы (AR с камерой или предпросмотр без камеры).

import { loadConfig, ConfigError } from './config.js';
import * as ui from './ui.js';

const params = new URLSearchParams(location.search);

const HINTS = {
  scan: 'Наведите камеру на визитку',
  open: 'Нажмите на визитку, чтобы открыть контакты',
  flip: 'Нажмите на визитку, чтобы увидеть контакты',
  gestures: 'Один палец — вращение, два — масштаб',
};
const GESTURE_HINT_TIME = 5000; // миллисекунд

/** Состояние сцены, от которого зависят подсказка и кнопка возврата. */
const sceneState = {
  mode: 'preview',       // 'preview' | 'scanning' | 'marker' | 'hand'
  markerVisible: false,
  flippedOnce: false,    // пользователь уже видел обратную сторону
  gestureHintUntil: 0,   // до какого момента показывать подсказку про жесты
};

/** Запущенный AR-режим (нужен кнопке «Вернуть на визитку»). */
let arSession = null;

boot();

async function boot() {
  ui.initErrorScreen();

  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    const message = error instanceof ConfigError
      ? error.message
      : 'Произошла непредвиденная ошибка при загрузке визитки.';
    console.error(error);
    ui.showError('Визитка недоступна', message);
    return;
  }

  ui.initUI(config, {
    onStartCamera: () => startCamera(config),
    onReturn: returnToMarker,
  });

  if (params.has('preview')) await startPreview(config);
  else ui.showScreen('start');
}

/**
 * Проверяет, может ли браузер дать доступ к камере (Ф14).
 * @returns {string|null} текст проблемы или null, если всё в порядке
 */
function findCameraProblem() {
  if (!window.isSecureContext) {
    return 'Камера доступна только по защищённому соединению (HTTPS). Откройте визитку по ссылке из QR-кода.';
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Этот браузер не даёт доступ к камере. Откройте страницу в Safari (iPhone) или Chrome (Android).';
  }
  return null;
}

/** AR-режим (Ф1): модули MindAR и Three.js загружаются только по нажатию кнопки. */
async function startCamera(config) {
  const problem = findCameraProblem();
  if (problem) {
    ui.showError('Камера недоступна', `${problem} Контакты можно посмотреть и без камеры.`);
    return;
  }

  ui.setCameraButtonBusy(true);
  try {
    const { startAR } = await import('./ar.js');
    sceneState.mode = 'scanning';
    arSession = await startAR(config, document.getElementById('ar-container'), sceneHandlers());
  } catch (error) {
    console.error(error);
    ui.setCameraButtonBusy(false);
    ui.showError(
      error.title ?? 'Не удалось запустить AR',
      `${error.title ? error.message : 'Не получилось загрузить модули дополненной реальности. Проверьте подключение к интернету.'} Контакты можно посмотреть и без камеры.`,
    );
    return;
  }
  showScene();
}

/** Режим предпросмотра без камеры (Ф16). Модули 3D загружаются только здесь. */
async function startPreview(config) {
  ui.showScreen('loader');
  try {
    const { startPreview: run } = await import('./preview.js');
    await run(config, document.getElementById('ar-container'), sceneHandlers());
  } catch (error) {
    console.error(error);
    ui.showError(
      'Не удалось показать 3D-визитку',
      'Похоже, браузер или устройство не поддерживает 3D-графику (WebGL). Контакты можно посмотреть и без неё.',
    );
    return;
  }
  showScene();
}

/** Убирает экраны и показывает элементы управления поверх сцены. */
function showScene() {
  ui.showScreen(null);
  ui.setSceneControlsVisible(true);
  refreshSceneUI();
}

/** Кнопка «Вернуть на визитку» (Ф21). */
function returnToMarker() {
  if (!arSession?.returnToMarker()) ui.showToast('Наведите камеру на печатную визитку, чтобы вернуть на неё 3D-визитку.');
}

/** Подсказка и кнопка возврата по состоянию сцены (Ф6, Ф14, Ф21). */
function refreshSceneUI() {
  const { mode, markerVisible, flippedOnce, gestureHintUntil } = sceneState;

  let hint = null;
  if (mode === 'scanning') hint = HINTS.scan;
  else if (mode === 'marker') hint = HINTS.open;
  else if (!flippedOnce) hint = HINTS.flip;
  else if (performance.now() < gestureHintUntil) hint = HINTS.gestures;
  ui.setHint(hint);

  ui.setReturnButton(mode === 'hand' ? (markerVisible ? 'ready' : 'waiting') : 'hidden');
}

/** Реакция интерфейса на события 3D-визитки; общая для предпросмотра и AR. */
function sceneHandlers() {
  return {
    onState({ mode, markerVisible }) {
      sceneState.mode = mode;
      sceneState.markerVisible = markerVisible;
      refreshSceneUI();
    },
    onFlip() {
      // После первого переворота подсказка про оборот больше не нужна (Ф6);
      // вместо неё на несколько секунд появляется подсказка про жесты
      if (!sceneState.flippedOnce) {
        sceneState.flippedOnce = true;
        sceneState.gestureHintUntil = performance.now() + GESTURE_HINT_TIME;
        setTimeout(refreshSceneUI, GESTURE_HINT_TIME + 50);
      }
      refreshSceneUI();
    },
    onAction(contact) {
      if (contact.id === 'vcard') ui.showToast(ui.VCARD_TOAST);
    },
  };
}
