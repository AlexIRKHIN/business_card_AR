// Жесты управления визиткой (Ф20): вращение одним пальцем, масштаб
// и перемещение двумя, колесо мыши для масштаба. Модуль общий для
// состояния «в руке» в AR и для предпросмотра.
//
// Жесты меняют «цель» (куда визитка должна прийти), а текущее положение
// в каждом кадре плавно догоняет цель — движение получается мягким,
// без рывков, и так же плавно выполняется сброс.

const ROTATE_SPEED = 0.008;   // радиан на пиксель
const MAX_PITCH = 1.1;        // предел наклона вверх-вниз, радиан
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.6;
const MAX_PAN_X = 0.7;        // пределы перемещения в ширинах визитки
const MAX_PAN_Y = 0.9;
const FOLLOW_SPEED = 16;      // чем больше, тем быстрее визитка догоняет палец

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * @param {object} options
 * @param {HTMLElement} options.element  область, в которой отслеживаются касания
 * @param {import('three').Object3D} options.target  объект, к которому применяются жесты
 * @param {() => boolean} [options.isEnabled]  false — жесты игнорируются
 * @param {() => number} options.pixelsPerUnit  ширина визитки на экране в пикселях (при масштабе 1)
 * @param {boolean} [options.wheel]  false — колесо мыши не масштабирует (страница с прокруткой)
 */
export function createGestures({ element, target, isEnabled = () => true, pixelsPerUnit, wheel = true }) {
  const goal = { yaw: 0, pitch: 0, zoom: 1, x: 0, y: 0 };
  const current = { ...goal };
  const pointers = new Map(); // активные касания: id → координаты
  let pinch = null;           // расстояние и центр между двумя пальцами

  // Порядок YXZ: поворот влево-вправо всегда вокруг вертикали экрана
  target.rotation.order = 'YXZ';

  function readPinch() {
    const [a, b] = [...pointers.values()];
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      centerX: (a.x + b.x) / 2,
      centerY: (a.y + b.y) / 2,
    };
  }

  function onPointerDown(event) {
    if (!isEnabled()) return;
    // Первое касание жеста: других пальцев на экране быть не может, поэтому
    // «застрявшие» записи (если браузер не прислал событие отпускания) сбрасываются
    if (event.isPrimary) pointers.clear();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinch = pointers.size === 2 ? readPinch() : null;
  }

  function onPointerMove(event) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    if (!isEnabled()) {
      pointers.clear();
      pinch = null;
      return;
    }
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    previous.x = event.clientX;
    previous.y = event.clientY;

    if (pointers.size === 1) {
      // Один палец: вращение
      goal.yaw += dx * ROTATE_SPEED;
      goal.pitch = clamp(goal.pitch + dy * ROTATE_SPEED, -MAX_PITCH, MAX_PITCH);
    } else if (pointers.size === 2 && pinch) {
      // Два пальца: изменение расстояния — масштаб, сдвиг центра — перемещение
      const next = readPinch();
      if (pinch.distance > 0) goal.zoom = clamp(goal.zoom * (next.distance / pinch.distance), MIN_ZOOM, MAX_ZOOM);
      const scale = pixelsPerUnit();
      goal.x = clamp(goal.x + (next.centerX - pinch.centerX) / scale, -MAX_PAN_X, MAX_PAN_X);
      goal.y = clamp(goal.y - (next.centerY - pinch.centerY) / scale, -MAX_PAN_Y, MAX_PAN_Y);
      pinch = next;
    }
  }

  function onPointerEnd(event) {
    pointers.delete(event.pointerId);
    pinch = pointers.size === 2 ? readPinch() : null;
  }

  function onWheel(event) {
    if (!isEnabled()) return;
    event.preventDefault();
    goal.zoom = clamp(goal.zoom * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
  }

  // Safari на iOS по умолчанию масштабирует всю страницу жестом двух пальцев
  const preventDefault = (event) => event.preventDefault();

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('pointerleave', onPointerEnd);
  if (wheel) element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('gesturestart', preventDefault);
  element.addEventListener('gesturechange', preventDefault);

  return {
    /** Вызывается в каждом кадре: текущее положение плавно догоняет цель. */
    update(dt) {
      const follow = 1 - Math.exp(-dt * FOLLOW_SPEED);
      for (const key of Object.keys(goal)) current[key] += (goal[key] - current[key]) * follow;
      target.rotation.set(current.pitch, current.yaw, 0);
      target.scale.setScalar(current.zoom);
      target.position.set(current.x, current.y, 0);
    },

    /** Плавно возвращает визитку в исходное положение. */
    reset() {
      pointers.clear();
      pinch = null;
      // Ближайший полный оборот, чтобы визитка не раскручивалась обратно
      goal.yaw = Math.round(current.yaw / (Math.PI * 2)) * Math.PI * 2;
      goal.pitch = 0;
      goal.zoom = 1;
      goal.x = 0;
      goal.y = 0;
    },

    dispose() {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('pointerleave', onPointerEnd);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', preventDefault);
      element.removeEventListener('gesturechange', preventDefault);
    },
  };
}
