// Отрисовка лицевой стороны печатной визитки. Это же изображение служит
// маркером для трекинга: вся лицевая сторона вместе с QR-кодом.
// Мелкие контрастные детали (гранёный фон, точки, QR-код) нужны, чтобы
// MindAR находил на изображении достаточно особых точек.

import qrcode from '../vendor/qrcode/qrcode.mjs';

/** Размер макета в пикселях: 90×50 мм при разрешении 508 dpi. */
export const MARKER_W = 1800;
export const MARKER_H = 1000;

const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PAD = 96;
const QR_SIZE = 430;

const font = (weight, size) => `${weight} ${size}px ${FONT}`;

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

/**
 * Генератор псевдослучайных чисел с зерном (mulberry32). Зерно берётся из
 * имени владельца, поэтому узор у каждой визитки свой, но при повторной
 * генерации получается тем же самым — иначе пришлось бы пересобирать .mind.
 */
function createRandom(seedText) {
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.codePointAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Гранёный фон: сетка точек со случайным смещением, разбитая на треугольники. */
function drawFacets(ctx, accent, random) {
  const cols = 15;
  const rows = 9;
  const stepX = MARKER_W / (cols - 1);
  const stepY = MARKER_H / (rows - 1);

  const points = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const edgeX = col === 0 || col === cols - 1;
      const edgeY = row === 0 || row === rows - 1;
      points.push({
        x: col * stepX + (edgeX ? 0 : (random() - 0.5) * stepX * 0.7),
        y: row * stepY + (edgeY ? 0 : (random() - 0.5) * stepY * 0.7),
      });
    }
  }
  const at = (col, row) => points[row * cols + col];

  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = at(col, row);
      const b = at(col + 1, row);
      const c = at(col + 1, row + 1);
      const d = at(col, row + 1);
      const triangles = random() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];

      for (const [p1, p2, p3] of triangles) {
        // Слева, под текстом, грани приглушены; справа и сверху ярче
        const centerX = (p1.x + p2.x + p3.x) / 3;
        const centerY = (p1.y + p2.y + p3.y) / 3;
        const strength = 0.35 + 0.65 * (centerX / MARKER_W) * (1 - 0.35 * (centerY / MARKER_H));
        const tone = random();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fillStyle = tone < 0.72
          ? rgba(accent, (0.05 + random() * 0.42) * strength)
          : `rgba(255, 255, 255, ${(0.03 + random() * 0.16) * strength})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.07 + 0.12 * strength})`;
        ctx.stroke();
      }
    }
  }

  // Точки в узлах сетки: дополнительные контрастные ориентиры
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + (point.x / MARKER_W) * 0.5})`;
    ctx.fill();
  }
}

/** QR-код в белой плашке с обязательными светлыми полями вокруг. */
function drawQr(ctx, url, x, y, size) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 3; // светлое поле в модулях с каждой стороны
  const module = Math.floor(size / (count + quiet * 2));
  const offset = (size - module * count) / 2;

  roundRect(ctx, x, y, size, size, 34);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = '#0b0f17';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(Math.round(x + offset + col * module), Math.round(y + offset + row * module), module, module);
      }
    }
  }
}

function fitName(ctx, name, maxWidth) {
  for (let size = 124; size >= 84; size -= 4) {
    ctx.font = font(700, size);
    if (ctx.measureText(name).width <= maxWidth) return { size, lines: [name] };
  }
  const words = name.split(/\s+/);
  const middle = Math.ceil(words.length / 2);
  const lines = words.length > 1 ? [words.slice(0, middle).join(' '), words.slice(middle).join(' ')] : [name];
  for (let size = 108; size >= 44; size -= 4) {
    ctx.font = font(700, size);
    if (lines.every((line) => ctx.measureText(line).width <= maxWidth)) return { size, lines };
  }
  return { size: 44, lines };
}

/**
 * Рисует лицевую сторону печатной визитки.
 * @param {HTMLCanvasElement} canvas  холст MARKER_W × MARKER_H
 * @param {import('../js/config.js').CardConfig} config
 * @param {string} url  адрес приложения, который кодируется в QR
 */
export function drawMarker(canvas, config, url) {
  const ctx = canvas.getContext('2d');
  const random = createRandom(config.name);

  const gradient = ctx.createLinearGradient(0, 0, MARKER_W, MARKER_H);
  gradient.addColorStop(0, '#0b0f17');
  gradient.addColorStop(1, '#16203a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, MARKER_W, MARKER_H);
  drawFacets(ctx, config.accent, random);

  // QR-код и подпись под ним
  const qrX = MARKER_W - PAD - QR_SIZE;
  const qrY = 170;
  drawQr(ctx, url, qrX, qrY, QR_SIZE);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(700, 40);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('AR-ВИЗИТКА', qrX + QR_SIZE / 2, qrY + QR_SIZE + 78);

  // Монограмма
  const mono = 196;
  roundRect(ctx, PAD, PAD, mono, mono, 50);
  ctx.fillStyle = config.accent;
  ctx.fill();
  ctx.fillStyle = config.onAccent;
  ctx.font = font(700, 82);
  ctx.textBaseline = 'middle';
  ctx.fillText(config.monogram, PAD + mono / 2, PAD + mono / 2 + 4);

  // Имя и роль
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const maxWidth = qrX - PAD - 70;
  const roleBaseline = 716;
  let nameBottom = roleBaseline;
  if (config.role) {
    ctx.font = font(600, 54);
    ctx.fillStyle = config.accent;
    ctx.fillText(config.role, PAD, roleBaseline, maxWidth);
    nameBottom = roleBaseline - 86;
  }
  const { size, lines } = fitName(ctx, config.name, maxWidth);
  ctx.font = font(700, size);
  ctx.fillStyle = '#ffffff';
  lines.forEach((line, index) => {
    ctx.fillText(line, PAD, nameBottom - (lines.length - 1 - index) * size * 1.12, maxWidth);
  });

  // Инструкция для получателя визитки
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(PAD, 786, MARKER_W - PAD * 2, 3);
  ctx.font = font(400, 38);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
  ctx.fillText('Сканируйте QR-код и наведите камеру на визитку', PAD, 872);
}
