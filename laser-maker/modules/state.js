// =============================================================================
// state.js — central store, subscribe pattern, undo/redo
// =============================================================================
import { deepClone } from './utils.js';

const HISTORY_LIMIT = 80;

const initial = {
  artboard: { w: 36, h: 24, unit: 'in' },         // inches
  viewport: { zoom: 1, panX: 60, panY: 60 },      // CSS pixels
  shapes: [],                                      // ordered, last = top (top-level only; groups embed children)
  selection: [],                                   // shape ids
  activeTool: 'select',
  grid: { enabled: false, size: 0.25, snap: false }, // inches
  guides: { enabled: true },
  midpoints: { enabled: true },
  isolationGroup: null,                            // id of group currently in isolation mode
  defaults: {
    fill: '#0F1419',
    fillEnabled: false,
    stroke: '#0F1419',
    strokeEnabled: true,
    strokeWidth: 1,
  },
};

class Store {
  constructor() {
    this.s = deepClone(initial);
    this.subs = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this._commitPending = false;
  }

  get() { return this.s; }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }

  _notify(reason) { for (const fn of this.subs) fn(this.s, reason); }

  // Mutate without history (e.g. cursor / viewport)
  patch(mut, reason = 'patch') {
    mut(this.s);
    this._notify(reason);
  }

  // Mutate WITH a history snapshot taken BEFORE the change
  commit(mut, reason = 'commit') {
    const snap = this._snapshot();
    mut(this.s);
    this.undoStack.push(snap);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this._notify(reason);
  }

  // For continuous interactions (drag): begin once, end once.
  beginTransaction() {
    if (this._tx) return;
    this._tx = this._snapshot();
  }
  endTransaction(reason = 'transaction') {
    if (!this._tx) return;
    this.undoStack.push(this._tx);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this._tx = null;
    this._notify(reason);
  }
  cancelTransaction() { this._tx = null; }

  undo() {
    if (!this.undoStack.length) return;
    const prev = this.undoStack.pop();
    this.redoStack.push(this._snapshot());
    this._restore(prev);
    this._notify('undo');
  }
  redo() {
    if (!this.redoStack.length) return;
    const next = this.redoStack.pop();
    this.undoStack.push(this._snapshot());
    this._restore(next);
    this._notify('redo');
  }

  _snapshot() {
    return {
      artboard: deepClone(this.s.artboard),
      shapes: deepClone(this.s.shapes),
      selection: [...this.s.selection],
      // isolationGroup intentionally excluded — transient UI state, reset on undo/redo
    };
  }
  _restore(snap) {
    this.s.artboard = deepClone(snap.artboard);
    this.s.shapes = deepClone(snap.shapes);
    this.s.selection = [...snap.selection];
    this.s.isolationGroup = null;
  }

  // Convenience accessors — all recursive through group children
  findShape(id) { return this._findIn(id, this.s.shapes); }
  _findIn(id, arr) {
    if (!arr) return null;
    for (const sh of arr) {
      if (sh.id === id) return sh;
      if (sh.type === 'group' && sh.children) {
        const f = this._findIn(id, sh.children);
        if (f) return f;
      }
    }
    return null;
  }

  // Returns the group that DIRECTLY contains shape with given id.
  // Returns null if at top level, undefined if not found anywhere.
  findParentGroup(id) { return this._findParentIn(id, this.s.shapes, null); }
  _findParentIn(id, arr, parent) {
    for (const sh of arr) {
      if (sh.id === id) return parent;
      if (sh.type === 'group' && sh.children) {
        const f = this._findParentIn(id, sh.children, sh);
        if (f !== undefined) return f;
      }
    }
    return undefined;
  }

  // Flat array of every shape at every depth (groups + their descendants)
  allShapes() { const r = []; this._collectAll(this.s.shapes, r); return r; }
  _collectAll(arr, r) {
    for (const sh of arr) {
      r.push(sh);
      if (sh.type === 'group' && sh.children) this._collectAll(sh.children, r);
    }
  }

  isSelected(id) { return this.s.selection.includes(id); }
  selectedShapes() { return this.s.selection.map(id => this.findShape(id)).filter(Boolean); }
}

export const store = new Store();
