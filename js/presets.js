/* Built-in presets, limits and default settings. */
var Presets = (function () {
  'use strict';

  var PHASE_LABELS = ['Inhale', 'Hold', 'Exhale', 'Rest'];

  var BUILTIN = {
    co2: {
      id: 'co2', kind: 'table', name: 'CO2 table',
      why: 'Builds tolerance to rising CO2 so the urge to breathe arrives later and feels calmer.',
      rounds: 8, holdStart: 90, holdStep: 0,
      breatheStart: 120, breatheStep: -15, minimum: 15, prep: 10
    },
    o2: {
      id: 'o2', kind: 'table', name: 'O2 table',
      why: 'Teaches your body to stay relaxed on low oxygen by stretching each hold while rests stay generous.',
      rounds: 8, holdStart: 60, holdStep: 15,
      breatheStart: 120, breatheStep: 0, minimum: 15, prep: 10
    },
    scuba: {
      id: 'scuba', kind: 'pattern', name: 'Scuba 4-6',
      why: 'A longer exhale slows the heart, calms nerves and lowers air consumption on a dive.',
      phases: [{ label: 'Inhale', seconds: 4 }, { label: 'Exhale', seconds: 6 }],
      minutes: 5, prep: 5
    },
    box: {
      id: 'box', kind: 'pattern', name: 'Box 4-4-4-4',
      why: 'Equal phases steady the breath and sharpen focus before a dive or a stressful moment.',
      phases: [
        { label: 'Inhale', seconds: 4 }, { label: 'Hold', seconds: 4 },
        { label: 'Exhale', seconds: 4 }, { label: 'Hold', seconds: 4 }
      ],
      minutes: 5, prep: 5
    },
    relax478: {
      id: 'relax478', kind: 'pattern', name: '4-7-8',
      why: 'The long hold and exhale trigger the relaxation response, helping you unwind or fall asleep.',
      phases: [
        { label: 'Inhale', seconds: 4 }, { label: 'Hold', seconds: 7 },
        { label: 'Exhale', seconds: 8 }
      ],
      minutes: 4, prep: 5
    },
    maxstatic: {
      id: 'maxstatic', kind: 'table', name: 'Max static attempt', attempt: true,
      why: 'One relaxed breathe-up, then hold as long as you comfortably can. The timer counts up with a tick during the hold; tap Stop when you breathe and the hold is logged as your max static.',
      rounds: 1, holdStart: 600, holdStep: 0,
      breatheStart: 120, breatheStep: 0, minimum: 15, prep: 10
    },
    coherent: {
      id: 'coherent', kind: 'pattern', name: 'Coherent 5-5',
      why: 'Six slow breaths a minute settle heart rate and nerves; a common pre-dive calm-down.',
      phases: [{ label: 'Inhale', seconds: 5 }, { label: 'Exhale', seconds: 5 }],
      minutes: 5, prep: 5
    },
    custom: {
      id: 'custom', kind: 'pattern', name: 'Custom pattern',
      why: 'Design your own rhythm: longer exhales relax, holds build tolerance.',
      phases: [{ label: 'Inhale', seconds: 5 }, { label: 'Exhale', seconds: 5 }],
      minutes: 5, prep: 5
    },
    chain: {
      id: 'chain', kind: 'chain', name: 'Full session',
      why: 'Several presets back to back as one audio track, for example a calm-down and then a table.',
      items: ['coherent', 'co2']
    }
  };

  var ORDER = ['co2', 'o2', 'maxstatic', 'scuba', 'box', 'relax478', 'coherent', 'custom', 'chain'];

  var DEFAULT_SETTINGS = {
    volume: 0.8,
    countdown: true,
    holdTicks: 0,
    wakeLock: true,
    mix: false,
    vibrate: false,
    tones: 'classic',
    theme: 'system',
    maxStatic: 0,
    goalMinutes: 0,
    tipSeen: false
  };

  var LIMITS = {
    rounds: { min: 1, max: 20, step: 1 },
    prep: { min: 0, max: 60, step: 5 },
    holdStart: { min: 5, max: 600, step: 5 },
    holdStep: { min: -60, max: 60, step: 5 },
    breatheStart: { min: 5, max: 600, step: 5 },
    breatheStep: { min: -60, max: 60, step: 5 },
    minimum: { min: 5, max: 120, step: 5 },
    minutes: { min: 1, max: 90, step: 1 },
    phaseSeconds: { min: 1, max: 60, step: 1 },
    roundSeconds: { min: 5, max: 3600, step: 5 },
    maxPhases: 6,
    maxParts: 6,
    maxSessionSeconds: 90 * 60
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function get(id) {
    return BUILTIN[id] ? clone(BUILTIN[id]) : null;
  }

  function isBuiltin(id) {
    return Object.prototype.hasOwnProperty.call(BUILTIN, id);
  }

  function snap(value, step, min, max) {
    var v = Math.round(value / step) * step;
    return Math.max(min, Math.min(max, v));
  }

  var TABLE_KEYS = ['rounds', 'prep', 'holdStart', 'holdStep', 'breatheStart', 'breatheStep', 'minimum'];

  function utf8ToBase64(str) {
    var bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
    return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64ToUtf8(b64) {
    var bytes = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    return decodeURIComponent(bytes.split('').map(function (c) { return '%' + ('0' + c.charCodeAt(0).toString(16)).slice(-2); }).join(''));
  }

  /* Compact, URL-safe text for a preset: only the fields the schedule needs. */
  function encodeConfig(cfg) {
    var out = { k: cfg.kind === 'table' ? 't' : 'p', n: cfg.name };
    if (cfg.why) { out.d = String(cfg.why).slice(0, 200); }
    if (cfg.kind === 'table') {
      TABLE_KEYS.forEach(function (key) { out[key] = cfg[key]; });
      if (cfg.attempt) { out.a = 1; }
      if (cfg.rows) { out.r = cfg.rows.map(function (r) { return [r.breathe, r.hold]; }); }
    } else {
      out.prep = cfg.prep;
      out.minutes = cfg.minutes;
      out.ph = cfg.phases.map(function (p) { return [PHASE_LABELS.indexOf(p.label), p.seconds]; });
    }
    return out;
  }

  /* A chain carries its parts inline (resolve(id) gives their configs) so the link is self-contained. */
  function encodeShare(cfg, resolve) {
    if (cfg.kind !== 'chain') { return utf8ToBase64(JSON.stringify(encodeConfig(cfg))); }
    var parts = cfg.items.map(resolve).filter(function (c) { return c && c.kind !== 'chain'; });
    return utf8ToBase64(JSON.stringify({ k: 'c', n: cfg.name, d: String(cfg.why || '').slice(0, 200), parts: parts.map(encodeConfig) }));
  }

  function clampTo(v, lim) {
    return Math.max(lim.min, Math.min(lim.max, Math.round(+v) || 0));
  }

  /* Config from shared text, with every value pulled back into range; null if it is not a preset. */
  function decodeConfig(raw) {
    if (!raw || (raw.k !== 't' && raw.k !== 'p')) { return null; }
    var name = String(raw.n || '').trim().slice(0, 40) || 'Shared preset';
    var why = String(raw.d || '').trim().slice(0, 200);
    if (raw.k === 't') {
      var cfg = { kind: 'table', name: name, why: why };
      TABLE_KEYS.forEach(function (key) { cfg[key] = clampTo(raw[key], LIMITS[key]); });
      if (raw.a) { cfg.attempt = true; cfg.rounds = 1; }
      var pairs = Array.isArray(raw.r) ? raw.r.filter(Array.isArray) : [];
      if (pairs.length && !cfg.attempt) {
        cfg.rows = pairs.slice(0, LIMITS.rounds.max).map(function (pair) {
          return { breathe: clampTo(pair[0], LIMITS.roundSeconds), hold: clampTo(pair[1], LIMITS.roundSeconds) };
        });
        cfg.rounds = cfg.rows.length;
      }
      return cfg;
    }
    var phases = (Array.isArray(raw.ph) ? raw.ph : []).filter(Array.isArray).slice(0, LIMITS.maxPhases).map(function (pair) {
      return { label: PHASE_LABELS[pair[0]] || 'Inhale', seconds: clampTo(pair[1], LIMITS.phaseSeconds) };
    });
    if (!phases.length) { return null; }
    return { kind: 'pattern', name: name, why: why, prep: clampTo(raw.prep, LIMITS.prep), minutes: clampTo(raw.minutes, LIMITS.minutes), phases: phases };
  }

  /* Config from shared text; a chain comes back as { kind: 'chain', name, parts: [configs] }. */
  function decodeShare(text) {
    var raw;
    try { raw = JSON.parse(base64ToUtf8(String(text))); } catch (e) { return null; }
    if (!raw || raw.k !== 'c') { return decodeConfig(raw); }
    var parts = (Array.isArray(raw.parts) ? raw.parts : []).map(decodeConfig).filter(Boolean).slice(0, LIMITS.maxParts);
    if (!parts.length) { return null; }
    return { kind: 'chain', name: String(raw.n || '').trim().slice(0, 40) || 'Shared session', why: String(raw.d || '').trim().slice(0, 200), parts: parts };
  }

  /* Rules-of-thumb starting values from a max static hold (seconds). */
  function suggestFromMax(kind, maxStatic) {
    var pb = Math.max(30, maxStatic | 0);
    if (kind === 'o2') {
      var start = snap(pb * 0.4, 5, 10, 600);
      var end = snap(pb * 0.8, 5, 10, 600);
      var step = snap((end - start) / 7, 5, 0, 60);
      return { rounds: 8, holdStart: start, holdStep: step, breatheStart: 120, breatheStep: 0, minimum: 15 };
    }
    var hold = snap(pb * 0.5, 5, 10, 600);
    var breathe = snap(Math.max(120, hold + 30), 15, 30, 600);
    return { rounds: 8, holdStart: hold, holdStep: 0, breatheStart: breathe, breatheStep: -15, minimum: 15 };
  }

  return {
    PHASE_LABELS: PHASE_LABELS,
    ORDER: ORDER,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    LIMITS: LIMITS,
    clone: clone,
    get: get,
    isBuiltin: isBuiltin,
    encodeShare: encodeShare,
    decodeShare: decodeShare,
    suggestFromMax: suggestFromMax
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = Presets; }
