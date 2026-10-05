// Shows a floating "Read selection" button when text is selected on a page.
// Firefox for Android cannot add extension items to the native
// text-selection toolbar, so this chip provides the same action in-page.
// Mobile only: desktop keeps the right-click context menu instead.

(function () {
  'use strict';

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (!isMobile) return;

  const CHIP_ID = 'custom-tts-reader-chip';
  let chip = null;
  let lastSelection = '';
  let chipPointerActive = false;

  function isEditableNode(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !!(el && el.closest && el.closest('input, textarea, select, [contenteditable]'));
  }

  function createChip() {
    chip = document.createElement('button');
    chip.id = CHIP_ID;
    chip.type = 'button';
    chip.textContent = 'Read selection';
    chip.style.cssText =
      'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
      'z-index:2147483647;padding:10px 18px;border:none;border-radius:999px;' +
      'background:#222;color:#fff;font:14px system-ui,sans-serif;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.4);cursor:pointer;opacity:0;' +
      'pointer-events:none;transition:opacity 0.15s ease;white-space:nowrap;';

    chip.addEventListener('mousedown', () => { chipPointerActive = true; }, { capture: true });
    chip.addEventListener('touchstart', () => { chipPointerActive = true; }, { passive: true });
    chip.addEventListener('touchcancel', () => { chipPointerActive = false; });
    chip.addEventListener('touchend', (event) => {
      // Prevent the tap from collapsing the selection before we read it.
      event.preventDefault();
      chipPointerActive = false;
      activate();
    }, { passive: false });
    chip.addEventListener('click', () => {
      chipPointerActive = false;
      activate();
    });

    (document.body || document.documentElement).appendChild(chip);
  }

  function showChip() {
    if (!chip) createChip();
    chip.style.opacity = '1';
    chip.style.pointerEvents = 'auto';
  }

  function hideChip() {
    if (chip) {
      chip.style.opacity = '0';
      chip.style.pointerEvents = 'none';
    }
  }

  function activate() {
    const text = lastSelection;
    lastSelection = '';
    chipPointerActive = false;
    hideChip();
    if (!text) return;
    try {
      browser.runtime
        .sendMessage({ action: 'readSelection', text: text })
        .catch(() => {});
    } catch (error) {
      // Extension context is gone (e.g. add-on reloaded) - nothing to do.
    }
  }

  document.addEventListener('selectionchange', () => {
    if (chipPointerActive) return;
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (text && !isEditableNode(selection.anchorNode)) {
      lastSelection = text;
      showChip();
    } else {
      lastSelection = '';
      hideChip();
    }
  });
})();
