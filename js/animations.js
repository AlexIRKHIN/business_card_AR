// Анимации 3D-визитки (Ф3, Ф4, Ф6): появление, парение, вращение
// декоративной фигуры и переворот на обратную сторону.
// Сторонние библиотеки не используются: значения рассчитываются
// в каждом кадре по функциям плавности.

const APPEAR_TIME = 1.0; // секунды
const FLIP_TIME = 0.7;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** Плавность с небольшим «перелётом» в конце: объект чуть перерастает и возвращается. */
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

/**
 * Создаёт аниматор для визитки из card.js.
 * Метод update(dt) нужно вызывать в каждом кадре.
 *
 * @param {Awaited<ReturnType<typeof import('./card.js').createCard>>} card
 */
export function createCardAnimator(card) {
  const { rig, body, decor } = card;
  const [crystal, shell] = decor.children;
  const decorBaseY = decor.position.y;

  let time = 0;
  let appearProgress = 0;   // 0 — визитки нет, 1 — полностью появилась
  let flipProgress = 1;     // 1 — переворот завершён
  let flipFrom = 0;
  let flipTo = 0;
  let flipped = false;

  rig.scale.setScalar(0.0001);

  function update(dt) {
    time += dt;

    // Появление (Ф3): визитка вырастает, поднимается и разворачивается к зрителю
    if (appearProgress < 1) appearProgress = Math.min(1, appearProgress + dt / APPEAR_TIME);
    const remaining = 1 - easeOutCubic(appearProgress);
    rig.scale.setScalar(Math.max(0.0001, easeOutBack(appearProgress)));

    // Парение (Ф4): плавное покачивание вверх-вниз и лёгкие наклоны
    rig.position.y = -0.28 * remaining + Math.sin(time * 1.6) * 0.012;
    rig.rotation.y = -Math.PI * 0.85 * remaining + Math.sin(time * 0.8) * 0.05;
    rig.rotation.x = Math.sin(time * 1.1) * 0.03;

    // Переворот (Ф6): поворот на 180° с небольшим выносом к зрителю
    if (flipProgress < 1) flipProgress = Math.min(1, flipProgress + dt / FLIP_TIME);
    const flip = easeInOutCubic(flipProgress);
    body.rotation.y = flipFrom + (flipTo - flipFrom) * flip;
    body.position.z = Math.sin(flip * Math.PI) * 0.1;

    // Декоративная фигура (Ф4): кристалл и оболочка вращаются в разные стороны
    crystal.rotation.y += dt * 0.9;
    crystal.rotation.x += dt * 0.45;
    shell.rotation.y -= dt * 0.5;
    shell.rotation.z += dt * 0.3;
    decor.position.y = decorBaseY + Math.sin(time * 2.1) * 0.015;
    decor.scale.setScalar(Math.max(0.0001, easeOutBack(clamp01((appearProgress - 0.35) / 0.65))));
  }

  return {
    update,

    /** Запускает анимацию появления с начала. */
    appear() {
      appearProgress = 0;
    },

    /** Переворачивает визитку на другую сторону. */
    flip() {
      if (flipProgress < 1) return false;
      flipFrom = flipTo;
      flipTo += Math.PI;
      flipProgress = 0;
      flipped = !flipped;
      return true;
    },

    /** true, если визитка повёрнута обратной стороной. */
    get isFlipped() {
      return flipped;
    },

    /** true, пока идёт переворот: в это время нажатия на кнопки не принимаются. */
    get isFlipping() {
      return flipProgress < 1;
    },
  };
}
