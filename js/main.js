// Точка входа: загружает конфиг, показывает интерфейс и выбирает режим
// работы (AR с камерой или предпросмотр без камеры).

import { loadConfig, ConfigError } from './config.js';
import * as ui from './ui.js';

const params = new URLSearchParams(location.search);

const HINTS = {
  scan: 'Наведите камеру на визитку',
  flip: 'Нажмите на визитку, чтобы увидеть контакты',
};
const GESTURE_HELP_TIME = 10000; // миллисекунд панель жестов видна, затем сворачивается в «?»

/** Состояние сцены, от которого зависят подсказка и кнопка смены режима. */
const sceneState = {
  mode: 'preview',       // 'preview' | 'scanning' | 'marker' | 'hand'
  markerVisible: false,
  flippedOnce: false,    // пользователь уже видел обратную сторону
};

let gestureHelpTimer = 0;

/** Запущенный AR-режим (нужен кнопке смены состояния визитки). */
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
    onModeButton: switchMode,
    onHelpButton: toggleGestureHelp,
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
  // В предпросмотре жесты доступны сразу, в AR — после перехода в режим осмотра
  if (sceneState.mode === 'preview' || sceneState.mode === 'hand') openGestureHelp();
}

/** Кнопка под визиткой: «Осмотреть визитку» на маркере, «Вернуть на визитку» в руке (Ф19, Ф21). */
function switchMode() {
  if (sceneState.mode === 'marker') {
    arSession?.inspect();
  } else if (!arSession?.returnToMarker()) {
    ui.showToast('Наведите камеру на печатную визитку, чтобы вернуть на неё 3D-визитку.');
  }
}

/** Показывает панель жестов и через несколько секунд сворачивает её в кнопку «?» (Ф20). */
function openGestureHelp() {
  ui.setGestureHelp('open');
  clearTimeout(gestureHelpTimer);
  gestureHelpTimer = setTimeout(() => ui.setGestureHelp('collapsed'), GESTURE_HELP_TIME);
}

function toggleGestureHelp() {
  if (ui.isGestureHelpOpen()) {
    clearTimeout(gestureHelpTimer);
    ui.setGestureHelp('collapsed');
  } else {
    openGestureHelp();
  }
}

/** Подсказка и кнопка смены режима по состоянию сцены (Ф6, Ф14, Ф19, Ф21). */
function refreshSceneUI() {
  const { mode, markerVisible, flippedOnce } = sceneState;

  let hint = null;
  if (mode === 'scanning') hint = HINTS.scan;
  else if (!flippedOnce) hint = HINTS.flip;
  ui.setHint(hint);

  if (mode === 'marker') ui.setModeButton('inspect');
  else if (mode === 'hand') ui.setModeButton(markerVisible ? 'return' : 'waiting');
  else ui.setModeButton('hidden');
}

/** Реакция интерфейса на события 3D-визитки; общая для предпросмотра и AR. */
function sceneHandlers() {
  return {
    onState({ mode, markerVisible }) {
      const previousMode = sceneState.mode;
      sceneState.mode = mode;
      sceneState.markerVisible = markerVisible;
      refreshSceneUI();

      // Панель жестов открывается при входе в режим осмотра и убирается на маркере
      if (mode === 'hand' && previousMode !== 'hand') {
        openGestureHelp();
      } else if (mode !== 'hand') {
        clearTimeout(gestureHelpTimer);
        ui.setGestureHelp('hidden');
      }
    },
    onFlip() {
      // После первого переворота подсказка про оборот больше не нужна (Ф6)
      sceneState.flippedOnce = true;
      refreshSceneUI();
    },
    onAction(contact) {
      if (contact.id === 'vcard') ui.showToast(ui.VCARD_TOAST);
    },
  };
}
