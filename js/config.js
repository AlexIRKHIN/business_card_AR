// Загрузка и проверка config.json (Ф11, Ф12, Ф17).
// Модуль превращает «сырой» конфиг в нормализованный объект, по которому
// строятся и 2D-панель контактов, и кнопки на 3D-визитке.

export const DEFAULT_ACCENT = '#4f8cff';

/** Ошибка конфига с текстом, который можно показать пользователю. */
export class ConfigError extends Error {}

/**
 * Загружает и проверяет конфиг.
 * @returns {Promise<CardConfig>}
 */
export async function loadConfig(url = 'config.json') {
  let response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new ConfigError('Не удалось загрузить данные визитки. Проверьте подключение к интернету.');
  }
  if (!response.ok) {
    throw new ConfigError(`Файл данных визитки не найден (config.json, код ${response.status}).`);
  }

  let raw;
  try {
    raw = await response.json();
  } catch {
    throw new ConfigError('В файле config.json ошибка: это не корректный JSON.');
  }
  return normalizeConfig(raw);
}

/**
 * Приводит конфиг к единому виду.
 *
 * @typedef {Object} Contact
 * @property {'phone'|'email'|'telegram'|'github'|'vcard'} id
 * @property {string} label    подпись кнопки
 * @property {string} display  значение, которое видит пользователь
 * @property {string} [value]  значение для vCard
 * @property {string} [href]   ссылка действия (нет у кнопки vCard)
 *
 * @typedef {Object} CardConfig
 * @property {string} name
 * @property {string} role
 * @property {string} monogram
 * @property {string} accent    цвет акцента (#rrggbb)
 * @property {string} onAccent  цвет текста, читаемый на акценте
 * @property {string} url       адрес опубликованного приложения для QR-кода (может быть пустым)
 * @property {Contact[]} contacts
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError('В файле config.json должен быть объект с данными визитки.');
  }

  const name = text(raw.name);
  if (!name) {
    throw new ConfigError('В файле config.json не заполнено обязательное поле «name».');
  }

  const contacts = [
    phoneContact(raw.phone),
    emailContact(raw.email),
    telegramContact(raw.telegram),
    githubContact(raw.github),
  ].filter(Boolean);

  // Кнопка «Сохранить контакт» есть всегда: для vCard достаточно имени.
  contacts.push({ id: 'vcard', label: 'Сохранить контакт', display: 'Файл .vcf для телефонной книги' });

  const accent = normalizeAccent(raw.theme?.accent);
  return {
    name,
    role: text(raw.role),
    monogram: makeMonogram(name),
    accent,
    onAccent: contrastColor(accent),
    url: /^https?:\/\/\S+$/i.test(text(raw.url)) ? text(raw.url) : '',
    contacts,
  };
}

/** Инициалы: первые буквы первых двух слов имени («Александр Ирхин» → «АИ»). */
export function makeMonogram(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0].toUpperCase())
    .join('');
}

function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function normalizeAccent(value) {
  const color = text(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_ACCENT;
}

/** Тёмный или белый текст в зависимости от яркости фона. */
function contrastColor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0b0f17' : '#ffffff';
}

function phoneContact(value) {
  const display = text(value);
  // В номере допустимы только цифры, пробелы, скобки, дефисы, точки и плюс
  // в начале; буквы и другие знаки означают, что это не номер.
  if (!/^\+?[\d\s().-]+$/.test(display)) return null;
  // Для tel: и vCard оставляем только цифры и ведущий плюс.
  const digits = display.replace(/[^\d+]/g, '');
  const count = digits.replace('+', '').length;
  if (count < 5 || count > 15) return null; // 15 цифр — предел международного формата E.164
  return { id: 'phone', label: 'Позвонить', display, value: digits, href: `tel:${digits}` };
}

function emailContact(value) {
  const email = text(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { id: 'email', label: 'Email', display: email, value: email, href: `mailto:${email}` };
}

function telegramContact(value) {
  const username = extractUsername(value, /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i);
  if (!/^[a-z0-9_]{3,}$/i.test(username)) return null;
  const href = `https://t.me/${username}`;
  return { id: 'telegram', label: 'Telegram', display: `@${username}`, value: href, href };
}

function githubContact(value) {
  const username = extractUsername(value, /^(?:https?:\/\/)?(?:www\.)?github\.com\//i);
  if (!/^[a-z0-9-]+$/i.test(username)) return null;
  const href = `https://github.com/${username}`;
  return { id: 'github', label: 'GitHub', display: `github.com/${username}`, value: href, href };
}

/** Принимает полную ссылку, «@имя» или просто имя и возвращает имя пользователя. */
function extractUsername(value, urlPrefix) {
  return text(value)
    .replace(urlPrefix, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
}
