// Voxalike+OrdaxEd — раскрывает нативный чат на экране выбора ролей.
// Стили vxp-lobby.css переносят его в правую боковую колонку.

(() => {
  'use strict';
  const NAME = 'lobby-role-chat';

  const init = () => {
    let queued = false;

    function dockChat() {
      queued = false;
      const stage = document.querySelector('.role-selection-stage');
      if (!stage || stage.dataset.vxpRoleChatDocked) return;
      const trigger = stage.querySelector('.role-selection-chat-trigger');
      if (!trigger) return;

      // Помечаем до click(): React может синхронно перерисовать экран. При ручном
      // закрытии чат не должен немедленно раскрываться снова.
      stage.dataset.vxpRoleChatDocked = '1';
      trigger.click();
    }

    function scheduleDock() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(dockChat);
    }

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const changed = [...record.addedNodes].some((node) => node.nodeType === 1 &&
          (node.matches('.role-selection-stage, .role-selection-chat-trigger') ||
            node.querySelector?.('.role-selection-stage, .role-selection-chat-trigger')));
        if (changed) {
          scheduleDock();
          return;
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleDock();
  };

  if (window.__VXP__ && window.__VXP__.registerModule) window.__VXP__.registerModule(NAME, init);
  else (window.__VXP_PLUGINS__ ||= []).push({ name: NAME, init });
})();
