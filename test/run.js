/* Node tests for the pure modules. Run: node test/run.js */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var os = require('os');

var Presets = require('../js/presets.js');
var Schedule = require('../js/schedule.js');
var Tones = require('../js/tones.js');
var SessionLog = require('../js/log.js');

var passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + (e && e.message)); process.exitCode = 1; }
}

test('fmt and parse', function () {
  assert.strictEqual(Schedule.fmt(90), '1:30');
  assert.strictEqual(Schedule.fmt(5), '0:05');
  assert.strictEqual(Schedule.fmt(3600), '1:00:00');
  assert.strictEqual(Schedule.parse('1:30'), 90);
  assert.strictEqual(Schedule.parse('90'), 90);
  assert.strictEqual(Schedule.parse('2m'), 120);
  assert.ok(isNaN(Schedule.parse('abc')));
});

test('CO2 default table: 8 rounds, hold 90, breathe 120 down to 15', function () {
  var rows = Schedule.tableRounds(Presets.get('co2'));
  assert.strictEqual(rows.length, 8);
  assert.deepStrictEqual(rows.map(function (r) { return r.breathe; }), [120, 105, 90, 75, 60, 45, 30, 15]);
  assert.ok(rows.every(function (r) { return r.hold === 90; }));
});

test('O2 default table: breathe fixed 120, hold 60 up to 165', function () {
  var rows = Schedule.tableRounds(Presets.get('o2'));
  assert.deepStrictEqual(rows.map(function (r) { return r.hold; }), [60, 75, 90, 105, 120, 135, 150, 165]);
  assert.ok(rows.every(function (r) { return r.breathe === 120; }));
});

test('table schedule is contiguous with prep first', function () {
  var s = Schedule.build(Presets.get('co2'));
  assert.strictEqual(s.segments.length, 1 + 16);
  assert.strictEqual(s.segments[0].kind, 'prep');
  assert.strictEqual(s.segments[1].kind, 'breathe');
  assert.strictEqual(s.segments[2].kind, 'hold');
  for (var i = 1; i < s.segments.length; i++) {
    assert.strictEqual(s.segments[i].start, s.segments[i - 1].end);
  }
  assert.strictEqual(s.total, 10 + 540 + 720);
  assert.strictEqual(s.segments[s.segments.length - 1].round, 8);
});

test('minimum clamps breathe time', function () {
  var cfg = Presets.get('co2'); cfg.rounds = 12;
  var rows = Schedule.tableRounds(cfg);
  assert.strictEqual(rows[11].breathe, 15);
});

test('pattern cycles and kinds', function () {
  var cfg = Presets.get('box');
  assert.strictEqual(Schedule.cycleLength(cfg.phases), 16);
  assert.strictEqual(Schedule.patternCycles(cfg), 19);   // 300 / 16 = 18.75 -> 19
  var s = Schedule.build(cfg);
  assert.strictEqual(s.rounds, 19);
  assert.strictEqual(s.total, 5 + 19 * 16);
  var kinds = s.segments.slice(1, 5).map(function (x) { return x.kind; });
  assert.deepStrictEqual(kinds, ['inhale', 'hold-in', 'exhale', 'hold-out']);
});

test('scuba pattern: 30 cycles of 4+6', function () {
  var s = Schedule.build(Presets.get('scuba'));
  assert.strictEqual(s.rounds, 30);
  assert.strictEqual(s.segments[1].kind, 'inhale');
  assert.strictEqual(s.segments[1].duration, 4);
  assert.strictEqual(s.segments[2].kind, 'exhale');
  assert.strictEqual(s.segments[2].duration, 6);
});

test('segmentAt binary search', function () {
  var s = Schedule.build(Presets.get('co2'));
  assert.strictEqual(Schedule.segmentAt(s, 0), 0);
  assert.strictEqual(Schedule.segmentAt(s, 9.99), 0);
  assert.strictEqual(Schedule.segmentAt(s, 10), 1);
  assert.strictEqual(Schedule.segmentAt(s, 130), 2);
  assert.strictEqual(Schedule.segmentAt(s, s.total - 0.01), 16);
  assert.strictEqual(Schedule.segmentAt(s, s.total), 17);
  assert.strictEqual(Schedule.segmentAt(s, -1), 0);
});

test('cues: one per segment, countdown ticks, done chime, sorted', function () {
  var s = Schedule.build(Presets.get('co2'));
  var c = Schedule.cues(s, { countdown: true, holdTicks: 30 });
  var starts = c.filter(function (x) { return x.tone !== 'tick' && x.tone !== 'holdtick' && x.tone !== 'done'; });
  assert.strictEqual(starts.length, s.segments.length);
  var ticks = c.filter(function (x) { return x.tone === 'tick'; });
  assert.strictEqual(ticks.length, 3 * 17);           // every segment is >= 8 s
  var holdTicks = c.filter(function (x) { return x.tone === 'holdtick'; });
  assert.strictEqual(holdTicks.length, 8 * 2);        // 90 s hold: ticks at +30 and +60
  assert.strictEqual(c[c.length - 1].tone, 'done');
  assert.strictEqual(c[c.length - 1].t, s.total);
  for (var i = 1; i < c.length; i++) { assert.ok(c[i].t >= c[i - 1].t); }
  var none = Schedule.cues(s, { countdown: false, holdTicks: 0 });
  var fifteen = Schedule.cues(s, { countdown: false, holdTicks: 15 });
  assert.strictEqual(fifteen.filter(function (x) { return x.tone === 'holdtick'; }).length, 8 * 5);   // 15..75
  assert.strictEqual(Schedule.cues(s, { countdown: false, holdTicks: true }).filter(function (x) { return x.tone === 'holdtick'; }).length, 0, 'booleans are not intervals');
  assert.strictEqual(none.length, s.segments.length + 1);
});

test('pattern cues: countdown ticks only before phases of 10 s or more', function () {
  var s = Schedule.build(Presets.get('scuba'));
  var c = Schedule.cues(s, { countdown: true });
  assert.strictEqual(c.filter(function (x) { return x.tone === 'tick'; }).length, 0);
  var r = Schedule.build(Presets.get('relax478'));   // the 8 s exhale stays quiet
  assert.strictEqual(Schedule.cues(r, { countdown: true }).filter(function (x) { return x.tone === 'tick'; }).length, 0);
  var cfg = Presets.get('custom'); cfg.phases = [{ label: 'Inhale', seconds: 5 }, { label: 'Hold', seconds: 20 }]; cfg.minutes = 1; cfg.prep = 0;
  var long = Schedule.build(cfg);
  var ticks = Schedule.cues(long, { countdown: true }).filter(function (x) { return x.tone === 'tick'; });
  assert.strictEqual(ticks.length, 3 * long.rounds);
  assert.strictEqual(ticks[0].t, long.segments[1].end - 3);
});

test('render: silence except at cues, volume scales amplitude', function () {
  var cues = [{ t: 0, tone: 'hold' }, { t: 2, tone: 'breathe' }, { t: 4, tone: 'done' }];
  var buf = Tones.render(cues, 4, 1);
  var sr = Tones.SAMPLE_RATE;
  assert.strictEqual(buf.length, Math.ceil((4 + Tones.TAIL) * sr));
  function peak(from, to) { var p = 0; for (var i = from; i < to; i++) { p = Math.max(p, Math.abs(buf[i])); } return p; }
  assert.ok(peak(0, sr * 0.6) > 20000, 'hold tone present');
  assert.ok(peak(sr * 1.0, sr * 1.9) === 0, 'silence between cues');
  assert.ok(peak(sr * 2, sr * 2.4) > 20000, 'breathe tone present');
  assert.ok(peak(sr * 4, sr * 4.8) > 20000, 'done chime present');
  var quiet = Tones.render(cues, 4, 0.5);
  var p1 = peak(0, sr * 0.6);
  var p2 = 0; for (var i = 0; i < sr * 0.6; i++) { p2 = Math.max(p2, Math.abs(quiet[i])); }
  assert.ok(Math.abs(p2 / p1 - 0.5) < 0.05, 'half volume');
  assert.strictEqual(buf[0], 0, 'attack ramp starts at zero');
});

test('encodeWav header and size', function () {
  var samples = new Int16Array(8000);
  samples[100] = 1234;
  var wav = Tones.encodeWav(samples);
  var v = new DataView(wav);
  assert.strictEqual(wav.byteLength, 44 + 16000);
  assert.strictEqual(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)), 'RIFF');
  assert.strictEqual(v.getUint32(4, true), 36 + 16000);
  assert.strictEqual(String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11)), 'WAVE');
  assert.strictEqual(v.getUint16(20, true), 1);
  assert.strictEqual(v.getUint16(22, true), 1);
  assert.strictEqual(v.getUint32(24, true), 8000);
  assert.strictEqual(v.getUint16(34, true), 16);
  assert.strictEqual(v.getUint32(40, true), 16000);
  assert.strictEqual(new Int16Array(wav, 44)[100], 1234);
});

test('full CO2 session renders and writes a WAV file', function () {
  var s = Schedule.build(Presets.get('co2'));
  var c = Schedule.cues(s, Presets.DEFAULT_SETTINGS);
  var t0 = Date.now();
  var wav = Tones.encodeWav(Tones.render(c, s.total, 0.8));
  var ms = Date.now() - t0;
  var expected = 44 + Math.ceil((s.total + Tones.TAIL) * Tones.SAMPLE_RATE) * 2;
  assert.strictEqual(wav.byteLength, expected);
  console.log('     ' + (wav.byteLength / 1048576).toFixed(2) + ' MB rendered in ' + ms + ' ms');
  if (process.env.WAV_OUT) { fs.writeFileSync(process.env.WAV_OUT, Buffer.from(wav)); console.log('     wrote ' + process.env.WAV_OUT); }
});

test('suggestFromMax heuristics', function () {
  var co2 = Presets.suggestFromMax('co2', 180);
  assert.strictEqual(co2.holdStart, 90);
  assert.strictEqual(co2.breatheStart, 120);
  var o2 = Presets.suggestFromMax('o2', 180);
  assert.strictEqual(o2.holdStart, 70);
  assert.strictEqual(o2.holdStep, 10);
});

test('history entry: completed session counts every round and hold', function () {
  var cfg = Presets.get('co2');
  var s = Schedule.build(cfg);
  var e = SessionLog.entry(s, cfg, s.total + 5, 1000);
  assert.strictEqual(e.completed, true);
  assert.strictEqual(e.rounds, 8);
  assert.strictEqual(e.total, s.total);
  assert.strictEqual(e.hold, 8 * 90);
  assert.strictEqual(e.longest, 90);
  assert.strictEqual(e.name, 'CO2 table');
});

test('history entry: stopped mid-hold counts the partial hold and finished rounds', function () {
  var cfg = Presets.get('co2');
  var s = Schedule.build(cfg);
  var t = s.segments[4].start + 30;   // round 2 hold, 30 s in
  var e = SessionLog.entry(s, cfg, t, 1000);
  assert.strictEqual(e.completed, false);
  assert.strictEqual(e.rounds, 1);
  assert.strictEqual(e.hold, 90 + 30);
  assert.strictEqual(e.longest, 90);
  assert.strictEqual(e.total, Math.round(t));
});

test('history add caps the list and keeps newest first', function () {
  var list = [];
  for (var i = 0; i < SessionLog.MAX + 5; i++) { list = SessionLog.add(list, { at: i, total: 1 }); }
  assert.strictEqual(list.length, SessionLog.MAX);
  assert.strictEqual(list[0].at, SessionLog.MAX + 4);
});

test('history totals, per day, streak and groups', function () {
  var now = new Date(2026, 8, 16, 12, 0, 0).getTime();
  var D = SessionLog.DAY;
  var list = [
    { at: now - 3600000, total: 600, hold: 300, longest: 90 },
    { at: now - D, total: 300, hold: 100, longest: 60 },
    { at: now - 2 * D, total: 900, hold: 0, longest: 0 },
    { at: now - 10 * D, total: 100, hold: 50, longest: 50 }
  ];
  var week = SessionLog.totals(list, now - 7 * D);
  assert.strictEqual(week.sessions, 3);
  assert.strictEqual(week.total, 1800);
  assert.strictEqual(week.hold, 400);
  assert.strictEqual(week.longest, 90);
  var days = SessionLog.perDay(list, 14, now);
  assert.strictEqual(days.length, 14);
  assert.strictEqual(days[13].total, 600);
  assert.strictEqual(days[12].total, 300);
  assert.strictEqual(days[11].total, 900);
  assert.strictEqual(days[3].total, 100);
  assert.strictEqual(SessionLog.streak(list, now), 3);
  assert.strictEqual(SessionLog.streak(list.slice(1), now), 2);   // yesterday and the day before still count
  assert.strictEqual(SessionLog.streak(list.slice(3), now), 0);
  var g = SessionLog.groups(list);
  assert.strictEqual(g.length, 4);
  assert.strictEqual(g[0].entries.length, 1);
});

test('tone sets: every set renders every cue, sets differ, decay fades', function () {
  var sr = Tones.SAMPLE_RATE;
  var kinds = ['prep', 'breathe', 'hold', 'inhale', 'exhale', 'hold-in', 'hold-out', 'tick', 'holdtick', 'done'];
  var rendered = {};
  Tones.SET_ORDER.forEach(function (id) {
    assert.ok(Tones.SETS[id].name);
    kinds.forEach(function (k) { assert.ok(Tones.SETS[id][k], id + ' has ' + k); });
    var buf = Tones.render(kinds.map(function (k, i) { return { t: i * 2, tone: k }; }), kinds.length * 2, 1, id);
    kinds.forEach(function (k, i) {
      var p = 0; for (var j = i * 2 * sr; j < (i * 2 + 0.3) * sr; j++) { p = Math.max(p, Math.abs(buf[j])); }
      assert.ok(p > 8000, id + ' ' + k + ' audible');
    });
    rendered[id] = buf;
  });
  var same = 0; for (var i = 0; i < 0.1 * sr; i++) { if (rendered.classic[i] === rendered.soft[i]) { same++; } }
  assert.ok(same < 0.05 * sr, 'classic and soft differ');
  var wood = Tones.render([{ t: 0, tone: 'prep' }], 1, 1, 'wood');
  var head = 0, tail = 0;
  for (var a = 0; a < 0.05 * sr; a++) { head = Math.max(head, Math.abs(wood[a])); }
  for (var b = 0.2 * sr; b < 0.25 * sr; b++) { tail = Math.max(tail, Math.abs(wood[b])); }
  assert.ok(tail < head / 4, 'wood block decays');
  assert.strictEqual(Tones.render([{ t: 0, tone: 'prep' }], 1, 1, 'nope')[0], Tones.render([{ t: 0, tone: 'prep' }], 1, 1)[0]);
});

test('share links round-trip and clamp bad values', function () {
  var co2 = Presets.get('co2'); co2.name = 'Buddy CO2 é';
  var text = Presets.encodeShare(co2);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(text));
  var back = Presets.decodeShare(text);
  assert.strictEqual(back.kind, 'table');
  assert.strictEqual(back.name, 'Buddy CO2 é');
  assert.deepStrictEqual(Schedule.tableRounds(back), Schedule.tableRounds(co2));
  assert.strictEqual(back.prep, 10);
  var box = Presets.get('box');
  var b2 = Presets.decodeShare(Presets.encodeShare(box));
  assert.strictEqual(b2.kind, 'pattern');
  assert.deepStrictEqual(b2.phases, box.phases);
  assert.strictEqual(Schedule.build(b2).total, Schedule.build(box).total);
  assert.strictEqual(Presets.decodeShare('not base64!!'), null);
  assert.strictEqual(Presets.decodeShare(btoa('{"k":"x"}')), null);
  var huge = Presets.decodeShare(btoa(JSON.stringify({ k: 't', n: '', rounds: 999, holdStart: -5, prep: 'abc' })));
  assert.strictEqual(huge.rounds, 20);
  assert.strictEqual(huge.holdStart, 5);
  assert.strictEqual(huge.prep, 0);
  assert.strictEqual(huge.name, 'Shared preset');
  var badPhase = Presets.decodeShare(btoa(JSON.stringify({ k: 'p', n: 'x', minutes: 3, ph: [[9, 4], [2, 400]] })));
  assert.deepStrictEqual(badPhase.phases, [{ label: 'Inhale', seconds: 4 }, { label: 'Exhale', seconds: 60 }]);
  assert.strictEqual(Presets.decodeShare(btoa(JSON.stringify({ k: 'p', n: 'x', ph: [] }))), null);
});

test('coherent preset: 30 cycles of 5+5, in the mode order before custom', function () {
  var s = Schedule.build(Presets.get('coherent'));
  assert.strictEqual(s.rounds, 30);
  assert.strictEqual(s.total, 5 + 300);
  assert.strictEqual(Presets.ORDER.indexOf('coherent'), Presets.ORDER.indexOf('custom') - 1);
});

test('history streak and chart survive daylight-saving changes', function () {
  var tz = process.env.TZ;
  process.env.TZ = 'America/New_York';
  var now = new Date(2026, 10, 2, 12, 0, 0).getTime();   // the day after fall-back
  var list = [0, 1, 2, 3].map(function (i) {
    var d = new Date(2026, 10, 2 - i, 9, 0, 0);
    return { at: d.getTime(), total: 60, hold: 0, longest: 0 };
  });
  assert.strictEqual(SessionLog.streak(list, now), 4);
  var days = SessionLog.perDay(list, 5, now);
  assert.deepStrictEqual(days.map(function (d) { return new Date(d.day).getDate(); }), [29, 30, 31, 1, 2]);
  assert.deepStrictEqual(days.map(function (d) { return d.sessions; }), [0, 1, 1, 1, 1]);
  assert.strictEqual(SessionLog.shiftDay(SessionLog.dayStart(now), -1), new Date(2026, 10, 1).getTime());
  var spring = new Date(2026, 2, 9, 12, 0, 0).getTime();
  var list2 = [0, 1, 2].map(function (i) { return { at: new Date(2026, 2, 9 - i, 9).getTime(), total: 60 }; });
  assert.strictEqual(SessionLog.streak(list2, spring), 3);
  process.env.TZ = tz;
});

test('share link with a malformed phase entry is ignored, not thrown', function () {
  var cfg = Presets.decodeShare(btoa(JSON.stringify({ k: 'p', n: 'x', minutes: 3, ph: [[0, 4], null, 'x', [2, 6]] })));
  assert.deepStrictEqual(cfg.phases, [{ label: 'Inhale', seconds: 4 }, { label: 'Exhale', seconds: 6 }]);
});

test('encodeSession matches encodeWav(render()) byte for byte', function () {
  var s = Schedule.build(Presets.get('scuba'));
  var c = Schedule.cues(s, Presets.DEFAULT_SETTINGS);
  var a = new Uint8Array(Tones.encodeSession(c, s.total, 0.7, 'soft'));
  var b = new Uint8Array(Tones.encodeWav(Tones.render(c, s.total, 0.7, 'soft')));
  assert.strictEqual(a.length, b.length);
  for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) { assert.fail('differs at byte ' + i); } }
});

test('history ratings, lastRatings and byPreset', function () {
  var list = [
    { at: 5, id: 'co2', name: 'CO2 table', total: 100 },
    { at: 4, id: 'co2', name: 'CO2 table', total: 100, rating: 'easy' },
    { at: 3, id: 'box', name: 'Box', total: 50, rating: 'hard' },
    { at: 2, id: 'co2', name: 'CO2 table', total: 100, rating: 'easy' }
  ];
  var rated = SessionLog.rate(list, 5, 'easy');
  assert.strictEqual(rated[0].rating, 'easy');
  assert.strictEqual(list[0].rating, undefined, 'original untouched');
  assert.deepStrictEqual(SessionLog.lastRatings(rated, 'co2', 3), ['easy', 'easy', 'easy']);
  assert.deepStrictEqual(SessionLog.lastRatings(list, 'co2', 3), ['', 'easy', 'easy']);
  assert.deepStrictEqual(SessionLog.lastRatings(list, 'o2', 3), []);
  var by = SessionLog.byPreset(list);
  assert.deepStrictEqual(by, [{ id: 'co2', name: 'CO2 table', sessions: 3, total: 300, longest: 0 }, { id: 'box', name: 'Box', sessions: 1, total: 50, longest: 0 }]);
  assert.strictEqual(SessionLog.byPreset([{ id: 'a', name: 'A', total: 1, longest: 40 }, { id: 'a', name: 'A', total: 1, longest: 90 }])[0].longest, 90);
});

test('max static attempt: one round, hold ticks forced, share keeps the flag', function () {
  var cfg = Presets.get('maxstatic');
  var s = Schedule.build(cfg);
  assert.strictEqual(s.attempt, true);
  assert.strictEqual(s.rounds, 1);
  assert.deepStrictEqual(s.segments.map(function (x) { return x.kind; }), ['prep', 'breathe', 'hold']);
  var c = Schedule.cues(s, { countdown: true, holdTicks: 0 });
  assert.strictEqual(c.filter(function (x) { return x.tone === 'holdtick'; }).length, 19);   // 600 s hold: 30..570
  assert.strictEqual(Schedule.cues(s, { countdown: true, holdTicks: 60 }).filter(function (x) { return x.tone === 'holdtick'; }).length, 9);
  var e = SessionLog.entry(s, cfg, s.segments[2].start + 125, 1);
  assert.strictEqual(e.longest, 125);
  var short = Presets.get('maxstatic'); short.breatheStart = 5; short.holdStart = 5;
  assert.deepStrictEqual(Schedule.tableRounds(short)[0], { round: 1, breathe: 5, hold: 5 }, 'attempts are not clamped by minimum');
  assert.strictEqual(e.attempt, true);
  var back = Presets.decodeShare(Presets.encodeShare(cfg));
  assert.strictEqual(back.attempt, true);
  assert.strictEqual(Schedule.build(back).attempt, true);
  assert.strictEqual(Presets.decodeShare(Presets.encodeShare(Presets.get('co2'))).attempt, undefined);
});

test('attempts picks the last n attempts oldest first', function () {
  var list = [
    { at: 5, attempt: true, longest: 100 },
    { at: 4, attempt: false, longest: 90 },
    { at: 3, attempt: true, longest: 80 },
    { at: 2, attempt: true, longest: 70 }
  ];
  assert.deepStrictEqual(SessionLog.attempts(list, 2).map(function (e) { return e.at; }), [3, 5]);
  assert.deepStrictEqual(SessionLog.attempts(list, 10).map(function (e) { return e.at; }), [2, 3, 5]);
});

test('history csv and summary lines', function () {
  var e1 = { at: new Date(2026, 8, 16, 9, 5).getTime(), id: 'co2', name: 'CO2 "long", table', kind: 'table', rounds: 8, roundsTotal: 8, total: 1270, hold: 720, longest: 90, completed: true, rating: 'easy' };
  var e2 = { at: new Date(2026, 8, 15, 18, 30).getTime(), id: 'maxstatic', name: 'Max static attempt', kind: 'table', attempt: true, rounds: 1, roundsTotal: 1, total: 315, hold: 185, longest: 185, completed: true, urge: 100 };
  var csv = SessionLog.csv([e1, e2]);
  var lines = csv.trim().split('\n');
  assert.strictEqual(lines[0], 'date,time,preset,kind,completed,rounds,rounds_total,total_s,hold_s,longest_hold_s,urge_s,rating');
  assert.strictEqual(lines[1], '2026-09-15,18:30,Max static attempt,attempt,yes,1,1,315,185,185,100,');
  assert.strictEqual(lines[2], '2026-09-16,09:05,"CO2 ""long"", table",table,yes,8,8,1270,720,90,,easy');
  assert.strictEqual(SessionLog.summary(e1, Schedule.fmt), 'CO2 "long", table: 8 rounds, 21:10, 12:00 on hold, felt easy');
  assert.strictEqual(SessionLog.summary(e2, Schedule.fmt), 'Max static attempt: held 3:05, first urge at 1:40');
  var partial = { name: 'Box', kind: 'pattern', rounds: 3, roundsTotal: 19, total: 60, hold: 0, completed: false };
  assert.strictEqual(SessionLog.summary(partial, Schedule.fmt), 'Box: 3 of 19 cycles, 1:00');
  assert.strictEqual(SessionLog.summary({ name: 'T', kind: 'table', rounds: 1, roundsTotal: 1, total: 100, hold: 30, completed: true }, Schedule.fmt), 'T: 1 round, 1:40, 0:30 on hold');
  var hostile = SessionLog.csv([{ at: 0, name: '=HYPERLINK("x")', kind: 'table', rounds: 1, roundsTotal: 1, total: 1, hold: 0, longest: 0, completed: true }]).split('\n')[1];
  assert.ok(hostile.indexOf(',"\'=HYPERLINK(""x"")",') > -1, 'formula names are neutralised: ' + hostile);
});

test('index.html asset versions and sw.js precache list agree', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  var assets = [];
  html.replace(/(?:src|href)="((?:js|css)\/[^"]+)"/g, function (m, url) { assets.push(url); return m; });
  assert.ok(assets.length >= 14, 'found the script and stylesheet links');
  var versions = assets.map(function (u) { return u.split('?v=')[1]; });
  assert.ok(versions.every(function (v) { return v && v === versions[0]; }), 'every asset carries the same ?v=: ' + versions.join(','));
  var cache = (sw.match(/CACHE = 'breathtrainer-v(\d+)'/) || [])[1];
  assert.strictEqual(cache, versions[0], 'CACHE name matches the asset version');
  var listed = [];
  sw.replace(/'\.\/((?:js|css)\/[^']+)'/g, function (m, url) { listed.push(url); return m; });
  assert.deepStrictEqual(listed.slice().sort(), assets.slice().sort(), 'sw.js precaches exactly the linked assets');
  assert.ok(/'\.\/', '\.\/index\.html'/.test(sw), 'root and index.html are precached');
  assert.ok(html.indexOf('build ' + versions[0] + '<') > -1, 'the version label in Settings matches');
});

test('chain: parts back to back, rounds count across parts, attempts excluded', function () {
  var chain = Presets.get('chain');
  chain.items = ['coherent', 'maxstatic', 'co2', 'nope'];
  var s = Schedule.build(chain, function (id) { return Presets.get(id); });
  var a = Schedule.build(Presets.get('coherent'));
  var b = Schedule.build(Presets.get('co2'));
  assert.strictEqual(s.kind, 'chain');
  assert.strictEqual(s.parts.length, 2, 'a mid-chain attempt and unknown ids are dropped');
  assert.strictEqual(s.attempt, false);
  var closing = Presets.get('chain'); closing.items = ['co2', 'maxstatic'];
  var cs = Schedule.build(closing, function (id) { return Presets.get(id); });
  assert.strictEqual(cs.parts.length, 2, 'an attempt may close the chain');
  assert.strictEqual(cs.attempt, true);
  assert.strictEqual(cs.total, b.total + Schedule.build(Presets.get('maxstatic')).total);
  var ticks = Schedule.cues(cs, { holdTicks: 0 }).filter(function (c) { return c.tone === 'holdtick'; });
  var attemptHold = cs.segments[cs.segments.length - 1];
  assert.strictEqual(ticks.length, 19, 'only the attempt hold ticks when hold ticks are off');
  assert.ok(ticks.every(function (c) { return c.t > attemptHold.start && c.t < attemptHold.end; }));
  assert.strictEqual(Schedule.cues(cs, { holdTicks: 60 }).filter(function (c) { return c.tone === 'holdtick'; }).length, 8 + 9, 'a chosen interval applies everywhere');
  assert.strictEqual(s.total, a.total + b.total);
  assert.strictEqual(s.segments.length, a.segments.length + b.segments.length);
  assert.strictEqual(s.rounds, a.rounds + b.rounds);
  for (var i = 1; i < s.segments.length; i++) { assert.strictEqual(s.segments[i].start, s.segments[i - 1].end); }
  var first = s.segments[a.segments.length];
  assert.strictEqual(first.kind, 'prep');
  assert.strictEqual(first.partName, 'CO2 table');
  assert.strictEqual(first.start, a.total);
  var hold = s.segments[a.segments.length + 2];
  assert.strictEqual(hold.kind, 'hold');
  assert.strictEqual(hold.partRound, 1);
  assert.strictEqual(hold.round, a.rounds + 1);
  assert.strictEqual(hold.roundsTotal, s.rounds);
  var e = SessionLog.entry(s, chain, hold.end + 1, 1);
  assert.strictEqual(e.rounds, a.rounds + 1);
  assert.strictEqual(e.hold, 90);
  assert.strictEqual(e.kind, 'chain');
  assert.strictEqual(SessionLog.summary(e, Schedule.fmt), 'Full session: ' + e.rounds + ' of ' + s.rounds + ' rounds, ' + Schedule.fmt(e.total) + ', 1:30 on hold');
  var cues = Schedule.cues(s, Presets.DEFAULT_SETTINGS);
  assert.strictEqual(cues[cues.length - 1].t, s.total);
  var empty = Schedule.build({ kind: 'chain', name: 'x', items: [] }, function () { return null; });
  assert.strictEqual(empty.segments.length, 0);
});

test('share links carry a chain with its parts inline', function () {
  var chain = Presets.get('chain');
  chain.items = ['coherent', 'maxstatic', 'co2'];
  var text = Presets.encodeShare(chain, function (id) { return Presets.get(id); });
  var back = Presets.decodeShare(text);
  assert.strictEqual(back.kind, 'chain');
  assert.strictEqual(back.name, 'Full session');
  assert.strictEqual(back.parts.length, 3, 'parts travel as they are; the schedule decides where an attempt counts');
  assert.strictEqual(back.parts[0].kind, 'pattern');
  assert.strictEqual(back.parts[1].attempt, true);
  assert.strictEqual(Schedule.build(back.parts[2]).total, Schedule.build(Presets.get('co2')).total);
  assert.strictEqual(Presets.decodeShare(btoa(JSON.stringify({ k: 'c', n: 'x', parts: [] }))), null);
  var many = Presets.decodeShare(btoa(JSON.stringify({ k: 'c', n: 'x', parts: new Array(9).fill({ k: 'p', n: 'p', minutes: 1, ph: [[0, 4]] }) })));
  assert.strictEqual(many.parts.length, Presets.LIMITS.maxParts);
});

test('table rows override the formula and survive a share link', function () {
  var cfg = Presets.get('co2');
  cfg.rows = [{ breathe: 120, hold: 60 }, { breathe: 120, hold: 90 }, { breathe: 120, hold: 60 }];
  cfg.rounds = 3;
  var rows = Schedule.tableRounds(cfg);
  assert.deepStrictEqual(rows.map(function (r) { return r.hold; }), [60, 90, 60]);
  var s = Schedule.build(cfg);
  assert.strictEqual(s.rounds, 3);
  assert.strictEqual(s.total, 10 + 360 + 210);
  var back = Presets.decodeShare(Presets.encodeShare(cfg));
  assert.deepStrictEqual(back.rows, cfg.rows);
  assert.strictEqual(back.rounds, 3);
  var bad = Presets.decodeShare(btoa(JSON.stringify({ k: 't', n: 'x', r: [[1, 9999], 'no', [30, 30]] })));
  assert.deepStrictEqual(bad.rows, [{ breathe: 5, hold: 3600 }, { breathe: 30, hold: 30 }]);
  assert.strictEqual(Presets.decodeShare(btoa(JSON.stringify({ k: 't', n: 'x', a: 1, r: [[30, 30]] }))).rows, undefined, 'attempts never carry rows');
  var none = Presets.decodeShare(btoa(JSON.stringify({ k: 't', n: 'x', r: ['x', 5], rounds: 4 })));
  assert.strictEqual(none.rows, undefined, 'no valid pairs means the formula stays');
  assert.strictEqual(none.rounds, 4);
  var big = Presets.get('o2'); big.holdStart = 600; big.holdStep = 60;
  big.rows = Schedule.tableRounds(big).map(function (r) { return { breathe: r.breathe, hold: r.hold }; });
  assert.strictEqual(Presets.decodeShare(Presets.encodeShare(big)).rows[7].hold, 1020, 'long formula holds survive the rows link');
});

test('history entry started from a later round counts only what was done', function () {
  var cfg = Presets.get('co2');
  var s = Schedule.build(cfg);
  var from = s.segments[7].start;   // round 4 breathe
  var e = SessionLog.entry(s, cfg, s.total + 1, 1000, from);
  assert.strictEqual(e.completed, true);
  assert.strictEqual(e.rounds, 5, 'five rounds were played');
  assert.strictEqual(e.hold, 5 * 90);
  assert.strictEqual(SessionLog.summary(e, Schedule.fmt), 'CO2 table: 5 of 8 rounds, 11:15, 7:30 on hold');
  var two = SessionLog.entry(s, cfg, s.segments[11].start, 1000, from);   // stopped at the start of round 6
  assert.strictEqual(two.rounds, 2, 'rounds 4 and 5 were played to their end');
  assert.strictEqual(e.total, s.total - from);
  var mid = SessionLog.entry(s, cfg, from + 75 + 30, 1000, from);   // 30 s into round 4 hold
  assert.strictEqual(mid.rounds, 0, 'rounds before the start do not count');
  assert.strictEqual(mid.hold, 30);
  assert.strictEqual(mid.total, 105);
});

console.log(passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
