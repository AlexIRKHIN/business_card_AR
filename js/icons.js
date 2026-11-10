// Иконки контактов в виде контуров SVG (поле 24×24).
// Один и тот же набор используется в 2D-панели (как <svg>) и на
// canvas-текстуре 3D-визитки (через Path2D).

export const ICON_PATHS = {
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  email: 'M3 6h18v12H3z M3 7l9 6 9-6',
  telegram: 'M21 4L3 11l6 2.5 M21 4l-3 15-9-5.5 M21 4L9 13.5V19l3-3.7',
  github: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M13.5 5l-3 14',
  vcard: 'M15 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19 8v6 M16 11h6',
};

// Иконки жестов для панели подсказок (поле 50×50): рука с одним или двумя
// вытянутыми пальцами и значок действия.
const HAND_ONE = 'M18 31V8a3 3 0 0 1 6 0v18 M24 24a3 3 0 0 1 6 0v3 M30 25a3 3 0 0 1 6 0v3 M36 26.5a3 3 0 0 1 6 0V34c0 6.6-5.4 12-12 12h-4c-4 0-7.6-2-9.8-5.2L9.6 30.5a3 3 0 0 1 .9-4.1 3.4 3.4 0 0 1 4.4.6L18 30.5';
const HAND_TWO = 'M16 31V15a3 3 0 0 1 6 0v11 M22 25V12a3 3 0 0 1 6 0v15 M28 25a3 3 0 0 1 6 0v3 M34 26.5a3 3 0 0 1 6 0V34c0 6.6-5.4 12-12 12h-4c-4 0-7.6-2-9.8-5.2L7.6 30.5a3 3 0 0 1 .9-4.1 3.4 3.4 0 0 1 4.4.6L16 30.5';

export const GESTURE_ICON_PATHS = {
  // один палец и круговая стрелка вокруг него
  rotate: `${HAND_ONE} M15.5 16.6A15 5 0 0 1 15.5 7.4 M26.5 7.4A15 5 0 0 1 27.5 16.5 M27.5 16.5l4.2-3.6 M27.5 16.5l5 2.2`,
  // два пальца и двусторонняя диагональная стрелка
  zoom: `${HAND_TWO} M33 15L44 4 M38.5 4H44v5.5 M33 9.5V15h5.5`,
  // два пальца и стрелки в четыре стороны
  pan: `${HAND_TWO} M39 3v16 M31 11h16 M36.5 5.5L39 3l2.5 2.5 M36.5 16.5L39 19l2.5-2.5 M33.5 8.5L31 11l2.5 2.5 M44.5 8.5L47 11l-2.5 2.5`,
};

function createSvg(d, size, box) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/** Возвращает элемент <svg> с иконкой контакта. */
export function createIcon(id, size = 22) {
  return createSvg(ICON_PATHS[id] ?? '', size, 24);
}

/** Возвращает элемент <svg> с иконкой жеста: 'rotate', 'zoom' или 'pan'. */
export function createGestureIcon(id, size = 34) {
  const svg = createSvg(GESTURE_ICON_PATHS[id] ?? '', size, 50);
  svg.classList.add('gesture-icon');
  return svg;
}
