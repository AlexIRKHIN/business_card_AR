// Точка входа: загружает конфиг, показывает интерфейс и выбирает режим
// работы (AR с камерой или предпросмотр без камеры).

import { loadConfig, ConfigError } from './config.js';
import * as ui from './ui.js';

const params = new URLSearchParams(location.search);
const SCAN_HINT = 'Наведите камеру на визитку';
const FLIP_HINT = 'Нажмите на визитку, чтобы увидеть контакты';

/** Состояние сцены, от которого зависит подсказка на экране. */
const sceneState = {
  tracking: true,      // маркер в кадре (в предпросмотре всегда true)
  flippedOnce: false,  // пользователь уже переворачивал визитку
};

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

  ui.initUI(config, { onStartCamera: () => startCamera(config) });

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
    sceneState.tracking = false;
    await startAR(config, document.getElementById('ar-container'), sceneHandlers());
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
  refreshHint();
}

/** Подсказка по состоянию сцены (Ф6, Ф14). */
function refreshHint() {
  if (!sceneState.tracking) ui.setHint(SCAN_HINT);
  else if (!sceneState.flippedOnce) ui.setHint(FLIP_HINT);
  else ui.setHint(null);
}

/** Реакция интерфейса на события 3D-визитки; общая для предпросмотра и AR. */
function sceneHandlers() {
  return {
    onTargetFound() {
      sceneState.tracking = true;
      refreshHint();
    },
    onTargetLost() {
      sceneState.tracking = false;
      refreshHint();
    },
    onFlip() {
      // Подсказка про оборот нужна только до первого переворота (Ф6)
      sceneState.flippedOnce = true;
      refreshHint();
    },
    onAction(contact) {
      if (contact.id === 'vcard') ui.showToast(ui.VCARD_TOAST);
    },
  };
}
