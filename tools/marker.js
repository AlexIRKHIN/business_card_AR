// Генератор печатной визитки и маркера. Работает прямо в браузере:
// рисует макет по config.json, отдаёт его как PNG, собирает из него
// файл трекинга targets.mind и готовит лист А4 для печати.

import { loadConfig } from '../js/config.js';
import { loadCardFonts } from '../js/card-textures.js';
import { drawMarker, MARKER_W, MARKER_H } from './marker-draw.js';

const $ = (id) => document.getElementById(id);
const canvas = $('marker-canvas');
canvas.width = MARKER_W;
canvas.height = MARKER_H;

/** Ширина изображения, из которого собирается файл трекинга. */
const TARGET_W = 900;

let config = null;

/** Адрес приложения по умолчанию: из конфига, иначе — папка уровнем выше генератора. */
function defaultUrl() {
  return config.url || new URL('../', location.href).href;
}

function redraw() {
  drawMarker(canvas, config, $('qr-url').value.trim() || defaultUrl());
  // Лист для печати состоит из копий текущего макета
  const dataUrl = canvas.toDataURL('image/png');
  for (const image of document.querySelectorAll('.print-sheet img')) image.src = dataUrl;
}

function download(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

function canvasToBlob() {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Собирает файл трекинга MindAR из текущего макета.
 * Библиотека подключается только при сборке: она занимает больше 2 МБ.
 * @returns {Promise<ArrayBuffer>}
 */
async function compileTarget(onProgress = () => {}) {
  const { Compiler } = await import('../vendor/mindar/mindar-image.prod.js');
  // Для трекинга достаточно уменьшенной копии макета: файл получается
  // заметно меньше, а распознавание не ухудшается.
  const small = document.createElement('canvas');
  small.width = TARGET_W;
  small.height = Math.round((TARGET_W * MARKER_H) / MARKER_W);
  const smallContext = small.getContext('2d');
  smallContext.imageSmoothingQuality = 'high';
  smallContext.drawImage(canvas, 0, 0, small.width, small.height);

  const image = new Image();
  image.src = small.toDataURL('image/png');
  await image.decode();

  const compiler = new Compiler();
  await compiler.compileImageTargets([image], onProgress);
  return compiler.exportData();
}

async function init() {
  const status = $('status');
  try {
    config = await loadConfig('../config.json');
  } catch (error) {
    status.textContent = error.message;
    return;
  }
  document.documentElement.style.setProperty('--accent', config.accent);
  document.documentElement.style.setProperty('--on-accent', config.onAccent);
  await loadCardFonts(`${config.name} ${config.role} Сканируйте QR-код и наведите камеру на визитку`);

  // Лист А4: десять визиток 90×50 мм
  const sheet = $('sheet');
  for (let i = 0; i < 10; i += 1) sheet.append(new Image());

  $('qr-url').value = defaultUrl();
  $('qr-url').addEventListener('input', redraw);
  redraw();
  status.textContent = `Макет построен для: ${config.name}`;

  $('btn-png').addEventListener('click', async () => download(await canvasToBlob(), 'marker.png'));

  $('btn-mind').addEventListener('click', async () => {
    const button = $('btn-mind');
    button.disabled = true;
    try {
      const buffer = await compileTarget((percent) => {
        status.textContent = `Сборка файла трекинга: ${Math.round(percent)} %`;
      });
      download(new Blob([buffer]), 'targets.mind');
      status.textContent = 'Готово. Положите targets.mind и marker.png в папку assets.';
    } catch (error) {
      console.error(error);
      status.textContent = 'Не удалось собрать файл трекинга. Попробуйте в Chrome на компьютере.';
    }
    button.disabled = false;
  });

  $('btn-print').addEventListener('click', () => window.print());
}

// Доступ для автоматической генерации файлов (скрипт сборки и проверки)
window.markerTool = { ready: init(), compileTarget, canvas };
