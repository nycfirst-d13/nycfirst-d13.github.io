// =============================================================================
// app.js — bootstrap. Imports wire everything via side effects.
// =============================================================================
import { store }    from './modules/state.js';
import { artboard } from './modules/artboard.js';
import { rulers }   from './modules/rulers.js';
import { tools }    from './modules/tools.js';
import './modules/group.js';
import './modules/shapes.js';
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
