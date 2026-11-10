// Иконки контактов в виде контуров SVG (поле 24×24).
// Один и тот же набор используется в 2D-панели (как <svg>) и будет
// использоваться на canvas-текстуре 3D-визитки (через Path2D).

export const ICON_PATHS = {
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  email: 'M3 6h18v12H3z M3 7l9 6 9-6',
  telegram: 'M21 4L3 11l6 2.5 M21 4l-3 15-9-5.5 M21 4L9 13.5V19l3-3.7',
  github: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M13.5 5l-3 14',
  vcard: 'M15 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19 8v6 M16 11h6',
};

/** Возвращает элемент <svg> с иконкой контакта. */
export function createIcon(id, size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICON_PATHS[id] ?? '');
  svg.append(path);
  return svg;
}
