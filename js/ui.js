// 2D-интерфейс поверх сцены: экраны, подсказки, ошибки и резервная
// панель контактов (Ф13, Ф14, Ф15).

import { createIcon, createGestureIcon } from './icons.js';
import { downloadVCard } from './vcard.js';

const $ = (id) => document.getElementById(id);

export const VCARD_TOAST = 'Файл контакта сохранён. Откройте его, чтобы добавить в телефонную книгу.';

let toastTimer = 0;

/**
 * Заполняет интерфейс данными конфига и навешивает обработчики.
 * @param {import('./config.js').CardConfig} config
 * @param {{ onStartCamera: () => void, onModeButton: () => void, onHelpButton: () => void }} handlers
 */
export function initUI(config, { onStartCamera, onModeButton, onHelpButton }) {
  applyTheme(config);
  document.title = `${config.name} — AR-визитка`;

  $('start-monogram').textContent = config.monogram;
  $('start-name').textContent = config.name;
  $('start-role').textContent = config.role;

  $('sheet-monogram').textContent = config.monogram;
  $('sheet-name').textContent = config.name;
  $('sheet-role').textContent = config.role;
  renderContacts(config);
  renderGestureHelp();

  $('btn-camera').addEventListener('click', onStartCamera);
  $('btn-mode').addEventListener('click', onModeButton);
  $('btn-help').addEventListener('click', onHelpButton);
  $('btn-contacts').addEventListener('click', openContacts);
  $('fab-contacts').addEventListener('click', openContacts);
  $('btn-error-contacts').addEventListener('click', openContacts);
  $('btn-error-contacts').hidden = false;
  $('btn-sheet-close').addEventListener('click', closeContacts);
  $('sheet-backdrop').addEventListener('click', closeContacts);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeContacts();
  });
}

/** Обработчик кнопки «Попробовать снова» доступен даже без конфига. */
export function initErrorScreen() {
  $('btn-error-retry').addEventListener('click', () => location.reload());
}

/** Цвет акцента из конфига и подходящий по контрасту цвет текста на нём (Ф12). */
function applyTheme(config) {
  const root = document.documentElement.style;
  root.setProperty('--accent', config.accent);
  root.setProperty('--on-accent', config.onAccent);
}

/** Строит список кнопок контактов по данным конфига (Ф11, Ф13). */
function renderContacts(config) {
  const list = $('contacts-list');
  list.replaceChildren();

  for (const contact of config.contacts) {
    // Ссылки делаем настоящими <a>, чтобы tel:, mailto: и внешние адреса
    // открывались штатными средствами браузера.
    const element = document.createElement(contact.href ? 'a' : 'button');
    element.className = 'contact';
    element.dataset.contact = contact.id;

    if (contact.href) {
      element.href = contact.href;
      if (contact.href.startsWith('http')) {
        element.target = '_blank';
        element.rel = 'noopener';
      }
    } else {
      element.type = 'button';
      element.classList.add('contact-accent');
      element.addEventListener('click', () => {
        downloadVCard(config);
        showToast(VCARD_TOAST);
      });
    }

    const icon = document.createElement('span');
    icon.className = 'contact-icon';
    icon.append(createIcon(contact.id));

    const textBox = document.createElement('span');
    textBox.className = 'contact-text';
    const label = document.createElement('span');
    label.className = 'contact-label';
    label.textContent = contact.label;
    const value = document.createElement('span');
    value.className = 'contact-value';
    value.textContent = contact.display;
    textBox.append(label, value);

    element.append(icon, textBox);
    const item = document.createElement('li');
    item.append(element);
    list.append(item);
  }
}

/** Жесты режима осмотра: иконка, название и пояснение (Ф20). */
const TOUCH_GESTURES = [
  { id: 'rotate', title: 'Вращение', text: 'ведите одним пальцем' },
  { id: 'zoom', title: 'Масштаб', text: 'сводите и разводите два пальца' },
  { id: 'pan', title: 'Перемещение', text: 'ведите двумя пальцами' },
];
/** На компьютере с мышью вместо касаний работают перетаскивание и колесо. */
const MOUSE_GESTURES = [
  { id: 'rotate', title: 'Вращение', text: 'тяните мышью' },
  { id: 'zoom', title: 'Масштаб', text: 'крутите колесо мыши' },
];

function renderGestureHelp() {
  const list = $('gesture-list');
  list.replaceChildren();
  const hasTouch = navigator.maxTouchPoints > 0;
  for (const gesture of hasTouch ? TOUCH_GESTURES : MOUSE_GESTURES) {
    const title = document.createElement('strong');
    title.textContent = gesture.title;
    const text = document.createElement('span');
    text.textContent = gesture.text;
    const textBox = document.createElement('div');
    textBox.append(title, text);
    const item = document.createElement('li');
    item.append(createGestureIcon(gesture.id), textBox);
    list.append(item);
  }
}

/** Показывает один из экранов: 'loader', 'start', 'error' или null (только сцена). */
export function showScreen(name) {
  for (const screen of document.querySelectorAll('.screen')) {
    screen.classList.toggle('is-active', screen.id === `screen-${name}`);
  }
}

/** Экран ошибки с понятным текстом (Ф14, Ф17). */
export function showError(title, message) {
  $('error-title').textContent = title;
  $('error-text').textContent = message;
  setHint(null);
  showScreen('error');
}

/** Подсказка поверх камеры; null скрывает её. */
export function setHint(message) {
  const hint = $('hint');
  hint.hidden = !message;
  hint.textContent = message ?? '';
}

/** Показывает или скрывает кнопки поверх сцены: «Контакты» и «На главную». */
export function setSceneControlsVisible(visible) {
  $('fab-contacts').hidden = !visible;
  $('btn-exit').hidden = !visible;
  if (!visible) {
    setModeButton('hidden');
    setGestureHelp('hidden');
  }
}

const MODE_BUTTON_TEXT = {
  inspect: 'Осмотреть визитку',
  return: '↩ Вернуть на визитку',
  waiting: '↩ Вернуть на визитку',
};

/**
 * Кнопка смены состояния визитки (Ф19, Ф21).
 * @param {'hidden'|'inspect'|'return'|'waiting'} state
 *   inspect — визитка на маркере, кнопка переводит её в режим осмотра;
 *   return — визитка в руке, кнопка возвращает её на маркер;
 *   waiting — то же, но маркера нет в кадре: кнопка приглушена
 */
export function setModeButton(state) {
  const button = $('btn-mode');
  button.hidden = state === 'hidden';
  button.textContent = MODE_BUTTON_TEXT[state] ?? '';
  button.classList.toggle('is-waiting', state === 'waiting');
}

/**
 * Панель подсказок по жестам (Ф20).
 * @param {'hidden'|'open'|'collapsed'} state  collapsed — видна только кнопка «?»
 */
export function setGestureHelp(state) {
  $('gesture-help').hidden = state !== 'open';
  $('btn-help').hidden = state === 'hidden';
  $('btn-help').setAttribute('aria-expanded', String(state === 'open'));
}

export function isGestureHelpOpen() {
  return !$('gesture-help').hidden;
}

export function openContacts() {
  $('sheet-backdrop').hidden = false;
  $('contacts-sheet').classList.add('is-open');
  $('contacts-sheet').setAttribute('aria-hidden', 'false');
}

export function closeContacts() {
  $('sheet-backdrop').hidden = true;
  $('contacts-sheet').classList.remove('is-open');
  $('contacts-sheet').setAttribute('aria-hidden', 'true');
}

/** Короткое всплывающее сообщение. */
export function showToast(message, duration = 3500) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
}

/** Блокирует кнопку запуска камеры на время загрузки AR-библиотек. */
export function setCameraButtonBusy(busy) {
  const button = $('btn-camera');
  button.disabled = busy;
  button.textContent = busy ? 'Запуск камеры…' : 'Запустить камеру';
}
