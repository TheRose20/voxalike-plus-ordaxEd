// Voxalike+OrdaxEd — выносит нативный чат выбора ролей в соседнюю панель.
// Сам чат не пересоздаётся: React-узел переносится целиком, поэтому сохраняются
// его состояние, отправка сообщений и обработчики Voxalike.

(() => {
  'use strict';
  const NAME = 'lobby-role-chat';
  const WIDE_LAYOUT = '(min-width: 1100px) and (min-height: 620px)';

  const init = (api) => {
    let queued = false;
    let placeholder = null;
    let relocatedSlot = null;
    let panel = null;
    let stageWithChat = null;
    let manuallyClosed = false;

    function disposePanel() {
      restoreSlot();
      stageWithChat = null;
      manuallyClosed = false;
    }

    function restoreSlot() {
      if (relocatedSlot && placeholder?.parentNode) placeholder.replaceWith(relocatedSlot);
      relocatedSlot = null;
      placeholder = null;
      panel?.remove();
      panel = null;
    }

    function dockChat() {
      queued = false;
      const stage = document.querySelector('.role-selection-stage');
      const slot = stage?.querySelector('.role-selection-chat-slot') || relocatedSlot;
      const round = stage?.closest('.round-slot');
      if (!stage || !slot || !round) {
        // Экран ролей размонтирован: возврат в лобби или запуск раунда.
        disposePanel();
        return;
      }
      if (stage !== stageWithChat) {
        stageWithChat = stage;
        manuallyClosed = false;
      }

      if (!matchMedia(WIDE_LAYOUT).matches) {
        restoreSlot();
        return;
      }

      if (!panel || !panel.isConnected) {
        panel = document.createElement('aside');
        panel.className = 'vxp-role-chat-panel panel';
        panel.setAttribute('aria-label', 'Room Chat');
        stage.after(panel);
      }
      if (slot.parentNode !== panel) {
        // React мог заменить слот при своей перерисовке, пока прежний находился
        // в панели. Старый узел уже не управляется React и больше не нужен.
        if (relocatedSlot && relocatedSlot !== slot) relocatedSlot.remove();
        placeholder?.remove();
        placeholder = document.createComment('vxp-role-selection-chat-slot');
        slot.replaceWith(placeholder);
        panel.append(slot);
        relocatedSlot = slot;
      }

      const trigger = slot.querySelector('.role-selection-chat-trigger');
      // Voxalike сворачивает чат после отправки сообщения. Открываем его снова,
      // но уважаем явное закрытие кнопкой отмены.
      if (trigger && !manuallyClosed) {
        stage.dataset.vxpRoleChatDocked = '1';
        trigger.click();
      }
    }

    function scheduleDock() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(dockChat);
    }

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest('.role-selection-chat-cancel')) manuallyClosed = true;
      if (target.closest('.role-selection-chat-trigger')) manuallyClosed = false;
    }, true);

    const observer = new MutationObserver(scheduleDock);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    matchMedia(WIDE_LAYOUT).addEventListener('change', scheduleDock);
    api.onBus('room', (room) => {
      if (!room || !room.roleSelectionActive) disposePanel();
      else scheduleDock();
    });
    window.addEventListener('pagehide', restoreSlot);
    scheduleDock();
  };

  if (window.__VXP__ && window.__VXP__.registerModule) window.__VXP__.registerModule(NAME, init);
  else (window.__VXP_PLUGINS__ ||= []).push({ name: NAME, init });
})();
