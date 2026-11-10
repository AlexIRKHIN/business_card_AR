// Конструктор визитки: форма с данными, живой предпросмотр 3D-визитки
// и печатной визитки, выдача файлов для репозитория — config.json,
// marker.png и targets.mind. Всё работает в браузере, сервер не нужен.

import { normalizeConfig, ConfigError, DEFAULT_ACCENT } from '../js/config.js';
import { loadCardFonts } from '../js/card-textures.js';
import { drawMarker, MARKER_W, MARKER_H } from './marker-draw.js';
import { createViewer } from './constructor-viewer.js';

const $ = (id) => document.getElementById(id);

const TEXT_FIELDS = ['name', 'role', 'phone', 'email', 'telegram', 'github', 'url'];
const ACCENTS = ['#4f8cff', '#7c5cff', '#18b6a4', '#2fbf71', '#f5a524', '#ff6b4a', '#e5488f'];
const DRAFT_KEY = 'ar-card-constructor-draft';
const UPDATE_DELAY = 250; // миллисекунд после последнего изменения до перестройки предпросмотра

/** Ширина изображения, из которого собирается файл трекинга. */
const TARGET_W = 900;

const canvas = $('marker-canvas');
canvas.width = MARKER_W;
canvas.height = MARKER_H;

let viewer = null;
let fileConfig = {};     // данные из config.json на сайте (для кнопки сброса)
let validConfig = null;  // последний корректный конфиг; null — скачивать нечего
let updateTimer = 0;

// ---------- Данные формы ----------

/** Собирает «сырой» конфиг в том виде, в каком он записывается в config.json. */
function readForm() {
  const raw = {};
  for (const id of TEXT_FIELDS) {
    const value = $(`f-${id}`).value.trim();
    if (value) raw[id] = value;
  }
  const { url, ...rest } = raw;
  const result = { ...rest, theme: { accent: $('f-accent').value } };
  if (url) result.url = url;
  return result;
}

function fillForm(raw) {
  for (const id of TEXT_FIELDS) $(`f-${id}`).value = raw[id] ?? '';
  const accent = /^#[0-9a-f]{6}$/i.test(raw.theme?.accent ?? '') ? raw.theme.accent.toLowerCase() : DEFAULT_ACCENT;
  $('f-accent').value = accent;
}

function toJson(raw) {
  return `${JSON.stringify(raw, null, 2)}\n`;
}

function saveDraft(raw) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(raw));
  } catch {
    // Хранилище недоступно (приватный режим): черновик просто не сохранится.
  }
}

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return draft && typeof draft === 'object' ? draft : null;
  } catch {
    return null;
  }
}

// ---------- Проверка ----------

function setFieldState(id, state, message) {
  const field = document.querySelector(`[data-field="${id}"]`);
  field.classList.remove('is-ok', 'is-warning', 'is-error');
  if (state) field.classList.add(`is-${state}`);
  field.querySelector('small').textContent = message;
}

const CONTACT_ERRORS = {
  phone: 'Не похоже на номер телефона: кнопки «Позвонить» на визитке не будет.',
  email: 'Не похоже на адрес почты: кнопки «Email» на визитке не будет.',
  telegram: 'Нужно имя пользователя или ссылка t.me/…: кнопки «Telegram» не будет.',
  github: 'Нужно имя пользователя или ссылка github.com/…: кнопки «GitHub» не будет.',
};

/** Адрес, который попадёт в QR-код: из формы, иначе — адрес этого сайта. */
function qrUrl(config) {
  return config.url || new URL('../', location.href).href;
}

/**
 * Проверяет данные тем же кодом, что и приложение, и показывает результат
 * под полями. Возвращает нормализованный конфиг или null.
 */
function validate(raw) {
  let config = null;
  try {
    config = normalizeConfig(raw);
    setFieldState('name', 'ok', `Монограмма: ${config.monogram}`);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    setFieldState('name', 'error', 'Имя обязательно: без него визитка не откроется.');
  }

  setFieldState('role', null, raw.role ? '' : 'Необязательно. Показывается под именем.');

  for (const id of Object.keys(CONTACT_ERRORS)) {
    const contact = config?.contacts.find((item) => item.id === id);
    if (!raw[id]) setFieldState(id, null, 'Не заполнено: кнопки на визитке не будет.');
    else if (contact) setFieldState(id, 'ok', `Кнопка на визитке: ${contact.display}`);
    else if (config) setFieldState(id, 'error', CONTACT_ERRORS[id]);
    else setFieldState(id, null, '');
  }

  setFieldState('accent', null, $('f-accent').value);
  for (const swatch of $('swatches').children) {
    swatch.classList.toggle('is-current', swatch.dataset.color === $('f-accent').value);
  }

  if (config) {
    const address = qrUrl(config);
    const local = /\/\/(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(address);
    if (raw.url && !config.url) {
      setFieldState('url', 'error', 'Адрес должен начинаться с https://. Пока в QR-коде адрес этого сайта.');
    } else if (local) {
      setFieldState('url', 'warning', `В QR-коде локальный адрес (${address}), с телефона он не откроется. Укажите адрес сайта на GitHub Pages.`);
    } else if (!config.url) {
      setFieldState('url', 'warning', `Не заполнено: в QR-код попадёт адрес этого сайта, ${address}`);
    } else {
      setFieldState('url', 'ok', 'Этот адрес зашит в QR-код на печатной визитке.');
    }
  } else {
    setFieldState('url', null, '');
  }
  return config;
}

// ---------- Предпросмотр и файлы ----------

function setStatus(message, isError = false) {
  $('status').textContent = message;
  $('status').classList.toggle('is-error', isError);
}

function markFile(id, done) {
  document.querySelector(`[data-file="${id}"]`).classList.toggle('is-done', done);
}

function setButtonsEnabled(enabled) {
  for (const id of ['btn-config', 'btn-png', 'btn-mind', 'btn-print']) $(id).disabled = !enabled;
}

/** Перестраивает всё по текущему содержимому формы. */
async function update() {
  const raw = readForm();
  saveDraft(raw);
  $('json-preview').textContent = toJson(raw);

  // Данные изменились: скачанные ранее файлы им больше не соответствуют
  for (const id of ['config', 'marker', 'mind']) markFile(id, false);

  const config = validate(raw);
  validConfig = config;
  setButtonsEnabled(Boolean(config));
  if (!config) {
    setStatus('Заполните имя: без него файлы собрать нельзя.', true);
    return;
  }
  setStatus(`Визитка готова: ${config.name}. Скачайте три файла по порядку.`);

  document.documentElement.style.setProperty('--accent', config.accent);
  document.documentElement.style.setProperty('--on-accent', config.onAccent);

  await loadCardFonts(`${config.name} ${config.role} Сканируйте QR-код и наведите камеру на визитку`);
  if (validConfig !== config) return; // пока грузился шрифт, данные изменились
  drawMarker(canvas, config, qrUrl(config));
  const dataUrl = canvas.toDataURL('image/png');
  for (const image of document.querySelectorAll('.print-sheet img')) image.src = dataUrl;

  await viewer?.setConfig(config);
}

function scheduleUpdate() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(update, UPDATE_DELAY);
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

// ---------- Запуск ----------

function initSwatches() {
  for (const color of ACCENTS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.dataset.color = color;
    swatch.style.background = color;
    swatch.setAttribute('aria-label', `Цвет ${color}`);
    swatch.addEventListener('click', () => {
      $('f-accent').value = color;
      update();
    });
    $('swatches').append(swatch);
  }
}

async function init() {
  initSwatches();
  for (let i = 0; i < 10; i += 1) $('sheet').append(new Image()); // лист А4: десять визиток

  // Исходные данные: текущий config.json сайта; черновик из браузера важнее
  try {
    const response = await fetch('../config.json', { cache: 'no-cache' });
    if (response.ok) fileConfig = await response.json();
  } catch {
    // Нет файла или в нём ошибка: форма начнётся пустой.
  }
  fillForm(loadDraft() ?? fileConfig);

  try {
    viewer = createViewer($('viewer'), {
      onAction: (contact) => {
        if (contact.id === 'vcard') setStatus('Кнопка «Сохранить контакт» сработала: скачан файл .vcf.');
      },
    });
  } catch (error) {
    console.error(error);
    $('viewer').textContent = 'Браузер не поддерживает 3D-графику (WebGL): предпросмотр 3D-визитки недоступен.';
  }

  $('form').addEventListener('input', scheduleUpdate);
  $('form').addEventListener('submit', (event) => event.preventDefault());
  $('btn-reset').addEventListener('click', () => {
    fillForm(fileConfig);
    update();
  });

  $('btn-config').addEventListener('click', () => {
    download(new Blob([toJson(readForm())], { type: 'application/json' }), 'config.json');
    markFile('config', true);
  });

  $('btn-png').addEventListener('click', async () => {
    download(await canvasToBlob(), 'marker.png');
    markFile('marker', true);
  });

  $('btn-mind').addEventListener('click', async () => {
    const config = validConfig;
    setButtonsEnabled(false);
    try {
      const buffer = await compileTarget((percent) => {
        setStatus(`Сборка файла трекинга: ${Math.round(percent)} %`);
      });
      if (validConfig !== config) {
        setStatus('Пока шла сборка, данные изменились. Соберите targets.mind ещё раз.', true);
      } else {
        download(new Blob([buffer]), 'targets.mind');
        markFile('mind', true);
        setStatus('Файл трекинга собран. Положите targets.mind и marker.png в папку assets, config.json — в корень.');
      }
    } catch (error) {
      console.error(error);
      setStatus('Не удалось собрать файл трекинга. Попробуйте в Chrome на компьютере.', true);
    }
    setButtonsEnabled(Boolean(validConfig));
  });

  $('btn-print').addEventListener('click', () => window.print());

  await update();
}

// Доступ для автоматической проверки и сборки файлов скриптом
window.cardConstructor = { ready: init(), compileTarget, canvas };
