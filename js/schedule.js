/* Config -> timed segments -> cue list. Pure functions, no DOM. */
var Schedule = (function () {
  'use strict';

  var LABELS = {
    prep: 'Get ready',
    breathe: 'Breathe',
    hold: 'Hold',
    inhale: 'Inhale',
    exhale: 'Exhale',
    'hold-in': 'Hold',
    'hold-out': 'Hold'
  };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function fmt(seconds) {
    var s = Math.max(0, Math.round(seconds));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    var mm = (h ? (m < 10 ? '0' : '') : '') + m;
    var ss = (r < 10 ? '0' : '') + r;
    return (h ? h + ':' : '') + mm + ':' + ss;
  }

  /* "1:30", "90" or "1m30" -> seconds, NaN if unparseable. */
  function parse(text) {
    var t = String(text).trim().toLowerCase().replace(/\s+/g, '');
    if (!t) { return NaN; }
    var m = t.match(/^(\d+):(\d{1,2})$/);
    if (m) { return (+m[1]) * 60 + (+m[2]); }
    m = t.match(/^(\d+)m(\d{1,2})?s?$/);
    if (m) { return (+m[1]) * 60 + (m[2] ? +m[2] : 0); }
    m = t.match(/^(\d+)s?$/);
    if (m) { return +m[1]; }
    return NaN;
  }

  /* Rows come from the formula, or from cfg.rows when the user edited rounds one by one. */
  function tableRounds(cfg) {
    var rows = [];
    var min = cfg.attempt ? 1 : (cfg.minimum || 5);   // an attempt shows only breathe-up and limit, so nothing hides a clamp
    if (cfg.rows) {
      return cfg.rows.map(function (r, i) {
        return { round: i + 1, breathe: clamp(r.breathe | 0, 1, 3600), hold: clamp(r.hold | 0, 1, 3600) };
      });
    }
    for (var i = 0; i < cfg.rounds; i++) {
      rows.push({
        round: i + 1,
        breathe: clamp(cfg.breatheStart + i * cfg.breatheStep, min, 3600),
        hold: clamp(cfg.holdStart + i * cfg.holdStep, min, 3600)
      });
    }
    return rows;
  }

  /* A Hold is hold-in after an inhale, hold-out otherwise. */
  function phaseKind(phases, index) {
    var label = phases[index].label;
    if (label === 'Inhale') { return 'inhale'; }
    if (label === 'Exhale') { return 'exhale'; }
    if (label === 'Rest') { return 'breathe'; }
    var n = phases.length;
    for (var k = 1; k < n; k++) {
      var prev = phases[(index - k + n) % n].label;
      if (prev === 'Inhale') { return 'hold-in'; }
      if (prev === 'Exhale' || prev === 'Rest') { return 'hold-out'; }
    }
    return 'hold-in';
  }

  function cycleLength(phases) {
    return phases.reduce(function (sum, p) { return sum + (p.seconds | 0); }, 0);
  }

  function patternCycles(cfg) {
    var len = cycleLength(cfg.phases);
    if (!len) { return 0; }
    return Math.max(1, Math.round((cfg.minutes * 60) / len));
  }

  /* A chain is other presets played back to back; resolve(id) returns their configs.
   * Rounds count up across the whole chain; partRound/partRounds are for display. */
  function buildChain(cfg, resolve) {
    var all = cfg.items.map(resolve).filter(function (c) { return c && c.kind !== 'chain'; });
    // A max attempt only makes sense at the end: warm-up parts first, then the hold that counts.
    var parts = all.filter(function (c, i) { return !c.attempt || i === all.length - 1; });
    var segments = [];
    var t = 0;
    var rounds = 0;
    parts.forEach(function (c, pi) {
      var sub = build(c);
      sub.segments.forEach(function (s) {
        segments.push(Object.assign({}, s, {
          i: segments.length,
          start: s.start + t,
          end: s.end + t,
          part: pi,
          partName: c.name,
          partKind: sub.kind,
          partRound: s.round,
          partRounds: sub.rounds,
          round: s.round ? rounds + s.round : 0
        }));
      });
      t += sub.total;
      rounds += sub.rounds;
    });
    segments.forEach(function (s) { s.roundsTotal = rounds; });
    var last = parts[parts.length - 1];
    return { kind: 'chain', name: cfg.name, attempt: !!(last && last.attempt), segments: segments, total: t, rounds: rounds, parts: parts };
  }

  /* Returns { kind, name, segments, total, rounds }. */
  function build(cfg, resolve) {
    if (cfg.kind === 'chain') { return buildChain(cfg, resolve); }
    var segments = [];
    var t = 0;
    var prep = cfg.prep | 0;

    function push(kind, duration, round, roundsTotal, label) {
      segments.push({
        i: segments.length,
        kind: kind,
        label: label || LABELS[kind],
        start: t,
        end: t + duration,
        duration: duration,
        round: round,
        roundsTotal: roundsTotal
      });
      t += duration;
    }

    if (cfg.kind === 'table') {
      var rows = tableRounds(cfg);
      if (prep > 0) { push('prep', prep, 0, rows.length); }
      rows.forEach(function (r) {
        push('breathe', r.breathe, r.round, rows.length);
        push('hold', r.hold, r.round, rows.length);
      });
      return { kind: 'table', name: cfg.name, attempt: !!cfg.attempt, segments: segments, total: t, rounds: rows.length };
    }

    var phases = (cfg.phases || []).filter(function (p) { return (p.seconds | 0) > 0; });
    var cycles = phases.length ? patternCycles({ phases: phases, minutes: cfg.minutes }) : 0;
    if (prep > 0) { push('prep', prep, 0, cycles); }
    for (var c = 1; c <= cycles; c++) {
      for (var p = 0; p < phases.length; p++) {
        push(phaseKind(phases, p), phases[p].seconds | 0, c, cycles, phases[p].label);
      }
    }
    return { kind: 'pattern', name: cfg.name, segments: segments, total: t, rounds: cycles };
  }

  /* Segment index at time t; segments.length once past the end. */
  function segmentAt(schedule, t) {
    var segs = schedule.segments;
    if (!segs.length || t >= schedule.total) { return segs.length; }
    if (t < 0) { return 0; }
    var lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (segs[mid].start <= t) { lo = mid; } else { hi = mid - 1; }
    }
    return lo;
  }

  /* [{ t, tone }] sorted by time. */
  function cues(schedule, settings) {
    var list = [];
    var countdown = !settings || settings.countdown !== false;
    var chosen = settings && typeof settings.holdTicks === 'number' ? settings.holdTicks : 0;
    var lastPart = schedule.parts ? schedule.parts.length - 1 : undefined;

    schedule.segments.forEach(function (s) {
      list.push({ t: s.start, tone: s.kind });
      var tableLike = s.kind === 'prep' || s.kind === 'breathe' || s.kind === 'hold';
      if (countdown && (tableLike ? s.duration >= 8 : s.duration >= 10)) {
        for (var k = 3; k >= 1; k--) { list.push({ t: s.end - k, tone: 'tick' }); }
      }
      // The hold of a max attempt always ticks so it can be followed with eyes closed.
      var every = chosen || (schedule.attempt && s.kind === 'hold' && s.part === lastPart ? 30 : 0);
      if (every && s.kind === 'hold') {
        for (var m = s.start + every; m < s.end - 3; m += every) { list.push({ t: m, tone: 'holdtick' }); }
      }
    });
    list.push({ t: schedule.total, tone: 'done' });
    list.sort(function (a, b) { return a.t - b.t; });
    return list;
  }

  return {
    fmt: fmt,
    parse: parse,
    clamp: clamp,
    tableRounds: tableRounds,
    cycleLength: cycleLength,
    patternCycles: patternCycles,
    build: build,
    segmentAt: segmentAt,
    cues: cues
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = Schedule; }
