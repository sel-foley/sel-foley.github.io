/* Expanded view: moves a card's player into a shared <dialog> (same DOM node, so
   decoded audio, the selected lane and playback carry over), blurs the page behind
   it, and puts the node back where it came from on close. */
(function () {
  'use strict';
  let dialog, body, titleEl, closeBtn;
  let current = null;   // { root, slot, trigger, player }

  function ensure() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'expand';
    dialog.innerHTML = '<div class="expand-inner"><div class="expand-bar"><span class="expand-title"></span>' +
      '<button class="expand-close" title="Close (Esc)" aria-label="Close">✕</button></div><div class="expand-body"></div></div>';
    document.body.appendChild(dialog);
    body = dialog.querySelector('.expand-body');
    titleEl = dialog.querySelector('.expand-title');
    closeBtn = dialog.querySelector('.expand-close');
    closeBtn.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // backdrop
    dialog.addEventListener('close', restore);                                            // ✕, Esc, backdrop
    return dialog;
  }

  function restore() {
    if (!current) return;
    const { root, slot, trigger, player } = current;
    current = null;
    root.classList.remove('size-l');
    slot.appendChild(root);
    document.body.classList.remove('modal-open');
    if (player && player.resizeCanvases) requestAnimationFrame(() => player.resizeCanvases());
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  /** Move `root` (a player element) into the dialog. `slot` is where it returns to. */
  function open(root, slot, title, trigger) {
    ensure();
    if (current) { if (current.root === root) return; restore(); if (dialog.open) dialog.close(); }
    const player = root._player || null;
    current = { root, slot: slot || root.parentElement, trigger: trigger || null, player };
    titleEl.textContent = title || '';
    root.classList.add('size-l');
    body.appendChild(root);
    document.body.classList.add('modal-open');
    if (!dialog.open) dialog.showModal();
    if (player && player.resizeCanvases) requestAnimationFrame(() => player.resizeCanvases());
  }

  function close() { if (dialog && dialog.open) dialog.close(); restore(); }

  /** Adds the ⤢ button to a player's video area. */
  function attach(player, slot, title) {
    const b = document.createElement('button');
    b.className = 'mtp-expand'; b.title = 'Expand'; b.setAttribute('aria-label', 'Expand this clip');
    b.addEventListener('click', e => { e.stopPropagation(); open(player.root, slot, title, b); });
    player.videoWrap.appendChild(b);
    return b;
  }

  window.Expand = { open, close, attach, get isOpen() { return !!(dialog && dialog.open); }, get current() { return current; } };
})();
