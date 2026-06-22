// =============================================================================
// app.js — bootstrap. Imports wire everything via side effects.
// =============================================================================
import { store }    from './modules/state.js';
import { artboard } from './modules/artboard.js';
import { rulers }   from './modules/rulers.js';
import { tools }    from './modules/tools.js';
import './modules/group.js';
import './modules/reflect.js';
import './modules/shapes.js';
import './modules/type.js';
import './modules/select.js';
import './modules/pen.js';
import './modules/pathops.js';
import './modules/layers.js';
import './modules/properties.js';
import './modules/export.js';
import './modules/keys.js';
import './modules/shapebuilder.js';
import './modules/text-panel.js';
import './modules/import-svg.js';
import './modules/expand-svg.js';
import './modules/image-etch-panel.js';
import './modules/align.js';
import './modules/context-menu.js';

// Collapsible + draggable panels
(function initPanels() {
  const chevronSVG = `<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`;
  const inspector = document.querySelector('.inspector');
  let dragEl = null, placeholder = null, fromHandle = false;

  document.querySelectorAll('.panel').forEach(panel => {
    const header = panel.querySelector('.panel-h');
    if (!header) return;
    const isFixed = panel.classList.contains('panel-fixed-bottom');

    const btn = document.createElement('button');
    btn.className = 'panel-toggle';
    btn.setAttribute('aria-label', 'Toggle panel');
    btn.innerHTML = chevronSVG;
    const actions = header.querySelector('.panel-h-actions');
    if (actions) actions.appendChild(btn);
    else header.appendChild(btn);

    header.addEventListener('click', e => {
      if (e.target.closest('.panel-toggle') || e.target.closest('.panel-h-actions')) return;
      panel.classList.toggle('collapsed');
    });
    btn.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('collapsed');
    });

    if (!isFixed) {
      header.addEventListener('mousedown', e => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
        fromHandle = true;
      });
      document.addEventListener('mouseup', () => { fromHandle = false; }, { capture: true });
      panel.setAttribute('draggable', 'true');

      panel.addEventListener('dragstart', e => {
        if (!fromHandle) { e.preventDefault(); return; }
        dragEl = panel;
        placeholder = document.createElement('div');
        placeholder.className = 'panel-drag-placeholder';
        placeholder.style.height = panel.offsetHeight + 'px';
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => panel.classList.add('dragging'), 0);
      });

      panel.addEventListener('dragend', () => {
        if (!dragEl) return;
        dragEl.classList.remove('dragging');
        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.replaceChild(dragEl, placeholder);
        }
        dragEl = null; placeholder = null; fromHandle = false;
      });

      panel.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragEl || !placeholder || dragEl === panel) return;
        const rect = panel.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) inspector.insertBefore(placeholder, panel);
        else inspector.insertBefore(placeholder, panel.nextSibling);
      });
    }
  });

  inspector.addEventListener('dragover', e => e.preventDefault());
  inspector.addEventListener('drop', e => {
    e.preventDefault();
    if (dragEl && placeholder && placeholder.parentNode) {
      placeholder.parentNode.replaceChild(dragEl, placeholder);
    }
  });
})();

// Set initial tool
tools.setActive('select');

// First paint — push a notification through state so subscribers refresh
store.patch(() => {}, 'boot');

// Friendly first-run welcome toast
(function welcome() {
  const t = document.getElementById('toast');
  t.textContent = 'Press R / E / L / P / B / T to draw · V to select';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
})();
