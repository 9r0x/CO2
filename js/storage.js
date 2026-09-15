/* localStorage persistence; every access is guarded because some browsers throw. */
var Storage = (function () {
  'use strict';

  var KEY = 'breathtrainer.v1';
  var timer = null;

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveNow(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function save(state) {
    clearTimeout(timer);
    timer = setTimeout(function () { saveNow(state); }, 250);
  }

  function clear() {
    clearTimeout(timer);
    try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  return { load: load, save: save, saveNow: saveNow, clear: clear };
})();
