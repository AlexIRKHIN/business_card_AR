// Отрисовка лицевой и обратной стороны 3D-визитки на canvas (Ф5, Ф7, Ф11, Ф12).
// Canvas затем используется как текстура Three.js. Все тексты, кнопки и цвета
// берутся из нормализованного конфига.

import { ICON_PATHS } from './icons.js';

/** Размер текстуры в пикселях; пропорции совпадают с визиткой 90×50 мм. */
export const TEX_W = 1440;
export const TEX_H = 800;

const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PAD = 72;

const COLORS = {
  bgFrom: '#0d121c',
  bgTo: '#1a2540',
  text: '#f2f5fa',
  muted: '#a3aec0',
  line: 'rgba(255, 255, 255, 0.14)',
  tile: 'rgba(255, 255, 255, 0.07)',
};

/**
 * Дожидается загрузки начертаний Inter: без этого первый кадр текстуры
 * нарисовался бы системным шрифтом.
 */
export async function loadCardFonts(sampleText) {
  if (!document.fonts?.load) return;
  const sample = `${sampleText} Abc Абв 0123`;
  try {
    await Promise.all([400, 600, 700].map((weight) => document.fonts.load(`${weight} 48px "Inter"`, sample)));
  } catch {
    // Если шрифт не загрузился, текст будет нарисован системным шрифтом.
  }
}

// ---------- Вспомогательные функции ----------

function font(weight, size) {
  return `${weight} ${size}px ${FONT}`;
}

function rgba(hex, alpha) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Обрезает текст многоточием, чтобы он поместился в заданную ширину. */
function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Иконка контакта: контур 24×24, растянутый до size и центрированный в точке (cx, cy). */
function drawIcon(ctx, id, cx, cy, size, color) {
  const path = ICON_PATHS[id];
  if (!path) return;
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(path));
  ctx.restore();
}

/** Общий фон обеих сторон: тёмный градиент, свечение акцента и сетка точек. */
function drawBackground(ctx, accent, glowX, glowY) {
  const gradient = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
  gradient.addColorStop(0, COLORS.bgFrom);
  gradient.addColorStop(1, COLORS.bgTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, 760);
  glow.addColorStop(0, rgba(accent, 0.42));
  glow.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let y = 20; y < TEX_H; y += 40) {
    for (let x = 20; x < TEX_W; x += 40) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
}

/**
 * Подбирает размер и разбивку имени на строки: сначала пробует одну
 * строку, затем две, уменьшая кегль, пока текст не поместится.
 */
function fitName(ctx, name, maxWidth) {
  for (let size = 112; size >= 80; size -= 4) {
    ctx.font = font(700, size);
    if (ctx.measureText(name).width <= maxWidth) return { size, lines: [name] };
  }

  const words = name.split(/\s+/);
  if (words.length > 1) {
    const middle = Math.ceil(words.length / 2);
    const lines = [words.slice(0, middle).join(' '), words.slice(middle).join(' ')];
    for (let size = 100; size >= 52; size -= 4) {
      ctx.font = font(700, size);
      if (lines.every((line) => ctx.measureText(line).width <= maxWidth)) return { size, lines };
    }
    ctx.font = font(700, 52);
    return { size: 52, lines: lines.map((line) => ellipsize(ctx, line, maxWidth)) };
  }

  ctx.font = font(700, 76);
  return { size: 76, lines: [ellipsize(ctx, name, maxWidth)] };
}

// ---------- Лицевая сторона ----------

/**
 * Лицевая сторона: монограмма, имя, роль и подсказка про оборот (Ф5, Ф6).
 * @param {HTMLCanvasElement} canvas
 * @param {import('./config.js').CardConfig} config
 */
export function drawFront(canvas, config) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  drawBackground(ctx, config.accent, TEX_W * 0.9, 0);

  // Монограмма из инициалов
  const mono = 176;
  roundRect(ctx, PAD, PAD, mono, mono, 44);
  ctx.fillStyle = config.accent;
  ctx.fill();
  ctx.fillStyle = config.onAccent;
  ctx.font = font(700, 72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(config.monogram, PAD + mono / 2, PAD + mono / 2 + 4);

  // Подпись в правом верхнем углу
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(600, 30);
  ctx.fillStyle = rgba(config.accent, 0.95);
  ctx.fillText('AR-ВИЗИТКА', TEX_W - PAD, PAD + 34);

  // Роль и имя «прижаты» к нижней части карточки
  ctx.textAlign = 'left';
  const maxWidth = TEX_W - PAD * 2;
  const roleBaseline = 610;
  let nameBottom = roleBaseline;

  if (config.role) {
    ctx.font = font(600, 50);
    ctx.fillStyle = config.accent;
    ctx.fillText(ellipsize(ctx, config.role, maxWidth), PAD, roleBaseline);
    nameBottom = roleBaseline - 78;
  }

  const { size, lines } = fitName(ctx, config.name, maxWidth);
  ctx.font = font(700, size);
  ctx.fillStyle = COLORS.text;
  lines.forEach((line, index) => {
    const baseline = nameBottom - (lines.length - 1 - index) * size * 1.12;
    ctx.fillText(line, PAD, baseline);
  });

  // Разделитель и подсказка (Ф6)
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(PAD, 660, maxWidth, 2);
  ctx.font = font(400, 32);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('Нажмите на визитку — контакты на обороте', PAD, 722);
}

// ---------- Обратная сторона ----------

/**
 * Рассчитывает прямоугольники кнопок обратной стороны в пикселях текстуры.
 * Кнопки-ссылки идут сеткой в два столбца, «Сохранить контакт» — во всю
 * ширину последней строкой. Раскладка подстраивается под число контактов.
 *
 * @param {import('./config.js').CardConfig} config
 * @returns {{ contact: import('./config.js').Contact, x: number, y: number, w: number, h: number }[]}
 */
export function layoutBack(config) {
  const links = config.contacts.filter((contact) => contact.id !== 'vcard');
  const vcard = config.contacts.find((contact) => contact.id === 'vcard');

  const rows = [];
  for (let i = 0; i < links.length; i += 2) rows.push(links.slice(i, i + 2));
  if (vcard) rows.push([vcard]);

  const top = 168;
  const bottom = TEX_H - 60;
  const gap = 22;
  const width = TEX_W - PAD * 2;
  const rowHeight = Math.min(172, (bottom - top - gap * (rows.length - 1)) / rows.length);
  const totalHeight = rowHeight * rows.length + gap * (rows.length - 1);
  const startY = top + (bottom - top - totalHeight) / 2;

  const rects = [];
  rows.forEach((row, rowIndex) => {
    const cellWidth = (width - gap * (row.length - 1)) / row.length;
    row.forEach((contact, cellIndex) => {
      rects.push({
        contact,
        x: PAD + cellIndex * (cellWidth + gap),
        y: startY + rowIndex * (rowHeight + gap),
        w: cellWidth,
        h: rowHeight,
      });
    });
  });
  return rects;
}

/**
 * Обратная сторона: шапка с именем и кнопки контактов (Ф7).
 * @param {HTMLCanvasElement} canvas
 * @param {import('./config.js').CardConfig} config
 * @param {ReturnType<typeof layoutBack>} layout
 * @param {string|null} highlightId  id кнопки, которую нужно подсветить (Ф8)
 */
export function drawBack(canvas, config, layout, highlightId = null) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  drawBackground(ctx, config.accent, TEX_W * 0.1, TEX_H);

  // Шапка: имя слева, роль справа
  const maxWidth = TEX_W - PAD * 2;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = font(700, 46);
  ctx.fillStyle = COLORS.text;
  const name = ellipsize(ctx, config.name, maxWidth * 0.6);
  ctx.fillText(name, PAD, 108);
  const nameWidth = ctx.measureText(name).width;

  if (config.role) {
    ctx.textAlign = 'right';
    ctx.font = font(600, 32);
    ctx.fillStyle = config.accent;
    ctx.fillText(ellipsize(ctx, config.role, maxWidth - nameWidth - 40), TEX_W - PAD, 106);
  }
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(PAD, 138, maxWidth, 2);

  for (const rect of layout) {
    const active = rect.contact.id === highlightId;
    if (rect.contact.id === 'vcard') drawSaveButton(ctx, config, rect, active);
    else drawLinkButton(ctx, config, rect, active);
  }
}

function drawLinkButton(ctx, config, { contact, x, y, w, h }, active) {
  roundRect(ctx, x, y, w, h, 30);
  ctx.fillStyle = active ? rgba(config.accent, 0.38) : COLORS.tile;
  ctx.fill();
  ctx.lineWidth = active ? 4 : 2;
  ctx.strokeStyle = active ? config.accent : COLORS.line;
  ctx.stroke();

  const tile = Math.min(100, h - 44);
  const tileX = x + 26;
  const tileY = y + (h - tile) / 2;
  roundRect(ctx, tileX, tileY, tile, tile, 26);
  ctx.fillStyle = rgba(config.accent, active ? 0.5 : 0.2);
  ctx.fill();
  drawIcon(ctx, contact.id, tileX + tile / 2, tileY + tile / 2, tile * 0.56, active ? '#ffffff' : config.accent);

  const textX = tileX + tile + 26;
  const textWidth = x + w - textX - 24;
  const centerY = y + h / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(700, 40);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(ellipsize(ctx, contact.label, textWidth), textX, centerY - 6);
  ctx.font = font(400, 29);
  ctx.fillStyle = active ? COLORS.text : COLORS.muted;
  ctx.fillText(ellipsize(ctx, contact.display, textWidth), textX, centerY + 36);
}

function drawSaveButton(ctx, config, { contact, x, y, w, h }, active) {
  roundRect(ctx, x, y, w, h, 30);
  ctx.fillStyle = config.accent;
  ctx.fill();
  if (active) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  ctx.font = font(700, 44);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const iconSize = 60;
  const gap = 22;
  const labelWidth = ctx.measureText(contact.label).width;
  const startX = x + (w - (iconSize + gap + labelWidth)) / 2;
  const centerY = y + h / 2;
  drawIcon(ctx, contact.id, startX + iconSize / 2, centerY, iconSize, config.onAccent);
  ctx.fillStyle = config.onAccent;
  ctx.fillText(contact.label, startX + iconSize + gap, centerY + 3);
}
