// 2D-интерфейс поверх сцены: экраны, подсказки, ошибки и резервная
// панель контактов (Ф13, Ф14, Ф15).

import { createIcon } from './icons.js';
import { downloadVCard } from './vcard.js';

const $ = (id) => document.getElementById(id);

let toastTimer = 0;

/**
 * Заполняет интерфейс данными конфига и навешивает обработчики.
 * @param {import('./config.js').CardConfig} config
 * @param {{ onStartCamera: () => void }} handlers
 */
export function initUI(config, { onStartCamera }) {
  applyTheme(config.accent);
  document.title = `${config.name} — AR-визитка`;

  $('start-monogram').textContent = config.monogram;
  $('start-name').textContent = config.name;
  $('start-role').textContent = config.role;

  $('sheet-monogram').textContent = config.monogram;
  $('sheet-name').textContent = config.name;
  $('sheet-role').textContent = config.role;
  renderContacts(config);

  $('btn-camera').addEventListener('click', onStartCamera);
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
function applyTheme(accent) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--on-accent', luminance > 0.62 ? '#0b0f17' : '#ffffff');
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
        showToast('Файл контакта сохранён. Откройте его, чтобы добавить в телефонную книгу.');
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

/** Показывает или скрывает кнопку «Контакты» поверх камеры. */
export function setContactsButtonVisible(visible) {
  $('fab-contacts').hidden = !visible;
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
