// Формирование и скачивание файла vCard (Ф10).

/** Экранирование спецсимволов по правилам vCard 3.0. */
function escapeValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

/**
 * Собирает текст vCard 3.0 из нормализованного конфига.
 * @param {import('./config.js').CardConfig} config
 */
export function buildVCard(config) {
  const [firstName, ...rest] = config.name.split(/\s+/);
  const lastName = rest.join(' ');
  const contact = (id) => config.contacts.find((item) => item.id === id);

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeValue(lastName)};${escapeValue(firstName)};;;`,
    `FN:${escapeValue(config.name)}`,
  ];
  if (config.role) lines.push(`TITLE:${escapeValue(config.role)}`);

  const phone = contact('phone');
  if (phone) lines.push(`TEL;TYPE=CELL:${phone.value}`);

  const email = contact('email');
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${email.value}`);

  // Ссылки с подписями: группа itemN связывает URL и его название.
  let group = 0;
  for (const id of ['telegram', 'github']) {
    const link = contact(id);
    if (!link) continue;
    group += 1;
    lines.push(`item${group}.URL:${link.value}`);
    lines.push(`item${group}.X-ABLabel:${link.label}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/**
 * Имя файла латиницей: часть браузеров теряет кириллическое имя вместе
 * с расширением, и телефон тогда не распознаёт файл как контакт.
 */
export function vcardFileName(name) {
  const latin = Array.from(name.toLowerCase())
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${latin || 'contact'}.vcf`;
}

/** Скачивает vCard как файл вида «aleksandr_irkhin.vcf». */
export function downloadVCard(config) {
  const blob = new Blob([buildVCard(config)], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = vcardFileName(config.name);
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
