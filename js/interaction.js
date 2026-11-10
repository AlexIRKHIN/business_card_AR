// Обработка нажатий на 3D-визитку (Ф6, Ф8, Ф9, Ф10).
// Точка касания переводится в луч из камеры (raycasting); по тому, какой
// объект пересёк луч, определяется действие: нажата кнопка контакта
// или сама визитка (тогда она переворачивается).

import * as THREE from 'three';
import { downloadVCard } from './vcard.js';

const TAP_MAX_MOVE = 10;   // пикселей: больше — это уже жест вращения, а не нажатие
const HIGHLIGHT_TIME = 350; // миллисекунд подсветка держится после нажатия

/**
 * Выполняет действие контакта (Ф9, Ф10).
 * Вызывается синхронно из обработчика click: иначе браузер может
 * заблокировать открытие новой вкладки или переход по tel:/mailto:.
 *
 * @param {import('./config.js').Contact} contact
 * @param {import('./config.js').CardConfig} config
 */
export function performAction(contact, config) {
  if (contact.id === 'vcard') {
    downloadVCard(config);
    return;
  }
  // Переход выполняется как нажатие на обычную ссылку: так tel:, mailto:
  // и внешние адреса обрабатываются штатными средствами браузера.
  const link = document.createElement('a');
  link.href = contact.href;
  if (contact.href.startsWith('http')) {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Подключает обработку нажатий.
 *
 * @param {object} options
 * @param {HTMLElement} options.element   область, по которой нажимает пользователь
 * @param {THREE.Camera} options.camera
 * @param {Awaited<ReturnType<typeof import('./card.js').createCard>>} options.card
 * @param {ReturnType<typeof import('./animations.js').createCardAnimator>} options.animator
 * @param {import('./config.js').CardConfig} options.config
 * @param {() => boolean} [options.isActive]  false — визитка скрыта, нажатия игнорируются
 * @param {() => boolean} [options.onCardTap]  своя обработка нажатия на визитку; true — обычный переворот не нужен
 * @param {(flipped: boolean) => void} [options.onFlip]
 * @param {(contact: import('./config.js').Contact) => void} [options.onAction]
 */
export function createInteraction({ element, camera, card, animator, config, isActive = () => true, onCardTap, onFlip, onAction }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const buttonMeshes = card.buttons.map((button) => button.mesh);
  const cardMeshes = card.body.children.filter((child) => child.isMesh); // корпус и обе грани

  let downPoint = null;
  let moved = false;
  let highlightTimer = 0;

  /** Переводит координаты события в луч и возвращает, что под ним. */
  function pick(event) {
    const rect = element.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // Области кнопок односторонние: луч попадает в них, только когда
    // обратная сторона визитки повёрнута к камере.
    if (!animator.isFlipping) {
      const buttonHit = raycaster.intersectObjects(buttonMeshes, false)[0];
      if (buttonHit) return { type: 'button', contact: buttonHit.object.userData.contact };
    }
    if (raycaster.intersectObjects(cardMeshes, false).length > 0) return { type: 'card' };
    return null;
  }

  function onPointerDown(event) {
    if (!event.isPrimary) return;
    downPoint = { x: event.clientX, y: event.clientY };
    moved = false;
    if (!isActive()) return;

    // Визуальный отклик сразу при касании кнопки (Ф8)
    const hit = pick(event);
    clearTimeout(highlightTimer);
    card.setHighlight(hit?.type === 'button' ? hit.contact.id : null);
  }

  function onPointerMove(event) {
    if (!downPoint || !event.isPrimary) return;
    if (Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y) > TAP_MAX_MOVE) {
      moved = true;
      card.setHighlight(null);
    }
  }

  function onPointerEnd() {
    downPoint = null;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => card.setHighlight(null), HIGHLIGHT_TIME);
  }

  function onClick(event) {
    if (moved || !isActive()) return;
    const hit = pick(event);
    if (!hit) return;

    if (hit.type === 'button') {
      card.setHighlight(hit.contact.id);
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => card.setHighlight(null), HIGHLIGHT_TIME);
      performAction(hit.contact, config);
      onAction?.(hit.contact);
    } else if (!onCardTap?.() && animator.flip()) {
      onFlip?.(animator.isFlipped);
    }
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('click', onClick);

  return {
    dispose() {
      clearTimeout(highlightTimer);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('click', onClick);
    },
  };
}
