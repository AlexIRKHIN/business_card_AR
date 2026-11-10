// Точка входа: загружает конфиг, показывает интерфейс и выбирает режим
// работы (AR с камерой или предпросмотр без камеры).

import { loadConfig, ConfigError } from './config.js';
import * as ui from './ui.js';

const params = new URLSearchParams(location.search);

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

async function startCamera(config) {
  const problem = findCameraProblem();
  if (problem) {
    ui.showError('Камера недоступна', `${problem} Контакты можно посмотреть и без камеры.`);
    return;
  }

  // Часть 5 плана: здесь подключается модуль ar.js (MindAR), запрашивается
  // доступ к камере и 3D-визитка привязывается к маркеру.
  ui.showToast('AR-режим появится на следующих этапах разработки. Пока доступны контакты без камеры.');
}

/** Режим предпросмотра без камеры (Ф16). Модули 3D загружаются только здесь. */
async function startPreview(config) {
  ui.showScreen('loader');
  try {
    const { startPreview: run } = await import('./preview.js');
    await run(config, document.getElementById('ar-container'));
  } catch (error) {
    console.error(error);
    ui.showError(
      'Не удалось показать 3D-визитку',
      'Похоже, браузер или устройство не поддерживает 3D-графику (WebGL). Контакты можно посмотреть и без неё.',
    );
    return;
  }
  ui.showScreen(null);
  ui.setSceneControlsVisible(true);
  ui.setHint('Потяните, чтобы повернуть визитку');
}
