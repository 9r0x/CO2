/* Persistent app state: settings, per-mode configs, user presets and the session log. */
var State = (function () {
  'use strict';

  function defaultState() {
    var configs = {};
    Presets.ORDER.forEach(function (id) { configs[id] = Presets.get(id); });
    return {
      version: 1,
      settings: Presets.clone(Presets.DEFAULT_SETTINGS),
      lastMode: 'co2',
      configs: configs,
      userPresetIds: [],
      history: []
    };
  }

  /* Older saves stored hold ticks as a boolean; it is now the interval in seconds (0 = off). */
  function normalizeSettings(s) {
    if (s.holdTicks === true) { s.holdTicks = 30; }
    if (s.holdTicks === false) { s.holdTicks = 0; }
    return s;
  }

  function load() {
    var saved = Storage.load();
    var base = defaultState();
    if (!saved || saved.version !== 1) { return base; }
    base.settings = normalizeSettings(Object.assign({}, base.settings, saved.settings || {}));
    var configs = saved.configs || {};
    Presets.ORDER.forEach(function (id) {
      base.configs[id] = Object.assign({}, base.configs[id], configs[id] || {});
    });
    base.userPresetIds = (saved.userPresetIds || []).filter(function (id) { return configs[id]; });
    base.userPresetIds.forEach(function (id) { base.configs[id] = configs[id]; });
    base.lastMode = base.configs[saved.lastMode] ? saved.lastMode : 'co2';
    base.history = saved.history || [];
    return base;
  }

  var data = load();
  var currentId = data.lastMode;

  var wiped = false;   // set by reset(): nothing may be written back while the page reloads

  function persist() { if (!wiped) { Storage.save(data); } }
  function saveNow() { if (!wiped) { Storage.saveNow(data); } }

  /* Wipes storage and reloads. The unload and visibility flushes run during the reload and
   * would write everything back, so writing is switched off first. */
  function reset() {
    wiped = true;
    Storage.clear();
    window.location.reload();
  }

  function current() { return currentId; }
  function cfg() { return data.configs[currentId]; }

  function select(id) {
    currentId = id;
    data.lastMode = id;
    persist();
  }

  function config(id) { return data.configs[id]; }

  function allPresetIds() {
    return Presets.ORDER.concat(data.userPresetIds);
  }

  /* Stores a config as a new user preset, selects it and returns its id. */
  var seq = 0;   // several presets can arrive in the same millisecond (a shared chain)

  function addPreset(config) {
    var id = 'user-' + Date.now() + '-' + (++seq);
    config.id = id;
    data.configs[id] = config;
    data.userPresetIds.push(id);
    select(id);
    return id;
  }

  function removePreset(id) {
    delete data.configs[id];
    data.userPresetIds = data.userPresetIds.filter(function (x) { return x !== id; });
    Object.keys(data.configs).forEach(function (k) {
      var c = data.configs[k];
      if (c.kind === 'chain') { c.items = c.items.filter(function (x) { return x !== id; }); }
    });
    select('co2');
  }

  function resetPreset(id) {
    data.configs[id] = Presets.get(id);
    persist();
  }

  /* JSON text of everything worth keeping. */
  function exportText() {
    return JSON.stringify(data, null, 1);
  }

  /* Replaces settings and presets from a backup and merges its session log; false if it is not a backup.
   * The object is swapped in place so the unload flush writes the imported data, not the old. */
  function importData(obj) {
    if (!obj || obj.version !== 1 || !obj.configs) { return false; }
    var seen = {};
    var merged = data.history.concat(obj.history || []).filter(function (e) {
      var key = e.at + ':' + e.total;
      if (seen[key]) { return false; }
      seen[key] = true;
      return true;
    }).sort(function (a, b) { return b.at - a.at; }).slice(0, SessionLog.MAX);
    var next = {
      version: 1,
      settings: normalizeSettings(Object.assign({}, data.settings, obj.settings || {})),
      lastMode: obj.lastMode,
      configs: obj.configs,
      userPresetIds: obj.userPresetIds || [],
      history: merged
    };
    Object.keys(data).forEach(function (k) { delete data[k]; });
    Object.assign(data, next);
    Storage.saveNow(data);
    return true;
  }

  function logSession(entry) {
    data.history = SessionLog.add(data.history, entry);
    persist();
  }

  function rateSession(at, rating) {
    data.history = SessionLog.rate(data.history, at, rating);
    persist();
  }

  function clearLog() {
    data.history = [];
    persist();
  }

  return {
    data: data,
    settings: data.settings,
    persist: persist,
    saveNow: saveNow,
    reset: reset,
    current: current,
    cfg: cfg,
    select: select,
    allPresetIds: allPresetIds,
    config: config,
    addPreset: addPreset,
    removePreset: removePreset,
    resetPreset: resetPreset,
    logSession: logSession,
    rateSession: rateSession,
    clearLog: clearLog,
    exportText: exportText,
    importData: importData
  };
})();
