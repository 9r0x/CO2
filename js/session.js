/* Session view: drives the display from the audio clock. */
var SessionView = (function () {
  'use strict';

  var $ = UI.$;
  var el = UI.el;
  var setText = UI.setText;

  var session = null;      // { schedule, config, lastIdx, lastLeft }
  var rafId = 0;
  var disarmStop = function () {};

  function active() { return !!session; }

  /* from: seconds into the schedule to begin at (a later round or part), 0 for the start. */
  function start(config, from) {
    var schedule = Schedule.build(config, State.config);
    var settings = State.settings;
    var cues = Schedule.cues(schedule, settings);

    session = { schedule: schedule, config: config, lastIdx: -1, lastLeft: -1, urge: 0, from: from || 0 };
    disarmStop();

    // Must stay synchronous inside the tap handler (iOS).
    var playing = Player.start(cues, schedule.total, settings);
    if (from) { Player.seek(from); }
    if (settings.wakeLock) { Player.requestWakeLock(); }

    Player.setMetadata(config.name, 'Get ready');
    Player.setHandlers({
      play: function () { Player.resume().catch(function () {}); },
      pause: function () { Player.pause(); },
      stop: stop,
      next: skip,
      previous: previous,
      seekto: seekTo
    });

    setText('s-mode', config.name);
    setText('s-note', '');
    $('btn-urge').disabled = false;
    UI.showView('session');
    playing.then(function () {
      Player.updatePosition();
      tick();
    }).catch(function (err) {
      setText('s-note', 'Audio did not start (' + (err && err.name ? err.name : 'blocked') + '). Tap Resume.');
      tick();
    });
    loop();
  }

  function loop() {
    cancelAnimationFrame(rafId);
    if (!session) { return; }
    tick();
    rafId = requestAnimationFrame(loop);
  }

  function tick() {
    if (!session) { return; }
    var sch = session.schedule;
    var segs = sch.segments;
    var t = Player.time();
    var idx = Schedule.segmentAt(sch, t);

    if (idx >= segs.length) { finish(); return; }
    var seg = segs[idx];

    var changed = idx !== session.lastIdx;
    if (changed) {
      session.lastIdx = idx;
      $('view-session').setAttribute('data-kind', seg.kind);
      setText('s-phase', seg.label);
      UI.replay($('s-phase'), 'pop');
      $('s-time').classList.remove('tick');
      UI.replay($('s-time'), 'pop');
      UI.replay($('s-ripple'), 'go');
      syncRing(seg, t);
      if (State.settings.vibrate && 'vibrate' in navigator && !document.hidden && session.lastIdx > 0) {
        navigator.vibrate(seg.kind === 'hold' || seg.kind === 'hold-in' || seg.kind === 'hold-out' ? 180 : 70);
      }
      setText('s-mode', seg.partName ? seg.partName + ' (' + (seg.part + 1) + ' of ' + sch.parts.length + ')' : session.config.name);
      setText('s-round', roundLabel(sch, seg));
      renderPips(sch, seg);
      $('btn-skip').hidden = attemptHold(seg);
      $('btn-prev').hidden = attemptHold(seg);
      $('btn-urge').hidden = !attemptHold(seg);
      if (attemptHold(seg)) { session.urge = 0; $('btn-urge').disabled = false; setText('s-note', ''); }
      var next = segs[idx + 1];
      setText('s-next', attemptHold(seg)
        ? 'Urge at the first contraction, Stop when you breathe'
        : (next ? 'Next: ' + (next.part !== seg.part ? next.partName + ', ' : '') + next.label + ' '
            + ((next.partKind || sch.kind) === 'table' ? Schedule.fmt(next.duration) : next.duration + ' s') : 'Last segment'));
      Player.setMetadata(seg.partName || session.config.name, seg.label + (seg.round ? ' (' + roundLabel(sch, seg).toLowerCase() + ')' : ''));
      Player.updatePosition();
    }

    var remaining = attemptHold(seg) ? Math.floor(t - seg.start) : Math.max(0, Math.ceil(seg.end - t));
    if (setText('s-time', (seg.partKind || sch.kind) === 'table' ? Schedule.fmt(remaining) : String(remaining)) && !changed) {
      $('s-time').classList.remove('pop');
      UI.replay($('s-time'), 'tick');
    }
    var frac = seg.duration ? Math.min(1, Math.max(0, (t - seg.start) / seg.duration)) : 1;
    $('s-bar').style.width = (frac * 100).toFixed(1) + '%';
    var left = Math.max(0, Math.ceil(sch.total - t));
    var leftKey = left + (Player.paused() ? 'p' : '');
    if (leftKey !== session.lastLeft) {
      session.lastLeft = leftKey;
      setText('s-remaining', attemptHold(seg)
        ? 'Limit ' + Schedule.fmt(seg.duration)
        : Schedule.fmt(left) + ' remaining' + (Player.paused() ? '' : ', ends ' + UI.clock(Date.now() + left * 1000)));
    }
    setText('btn-pause', Player.paused() ? 'Resume' : 'Pause');
    $('s-ring').style.animationPlayState = Player.paused() ? 'paused' : 'running';
    $('view-session').classList.toggle('paused', Player.paused());
  }

  function roundLabel(sch, seg) {
    if (attemptPart(seg)) { return 'Max attempt'; }
    var kind = seg.partKind || sch.kind;
    var unit = kind === 'table' ? 'round' : 'cycle';
    var total = seg.partRounds || sch.rounds;
    if (seg.kind === 'prep') { return total + ' ' + unit + (total === 1 ? '' : 's'); }
    var word = unit.charAt(0).toUpperCase() + unit.slice(1) + ' ';
    return word + (seg.partRound || seg.round) + ' of ' + total;
  }

  /* The hold of a max static attempt counts up and ends when the user taps Stop. */
  function attemptPart(seg) {
    var sch = session.schedule;
    return sch.attempt && (seg.part === undefined || seg.part === sch.parts.length - 1);
  }

  function attemptHold(seg) {
    return attemptPart(seg) && seg.kind === 'hold';
  }

  /* One dot per round; hidden for long pattern sessions where cycles are not worth counting. */
  function renderPips(sch, seg) {
    var box = $('s-pips');
    if (sch.rounds > 20) { box.innerHTML = ''; return; }
    if (box.childElementCount !== sch.rounds) {
      box.innerHTML = '';
      for (var i = 0; i < sch.rounds; i++) { box.appendChild(el('span', 'pip')); }
    }
    // A "Get ready" between chained parts has no round of its own; keep the finished ones lit.
    var done = seg.round ? seg.round - 1 : (seg.i ? sch.segments[seg.i - 1].round : 0);
    for (var r = 1; r <= sch.rounds; r++) {
      box.children[r - 1].className = 'pip' + (r <= done ? ' past' : (r === seg.round ? ' now' : ''));
    }
  }

  /* Inhale/exhale animate over the segment length; the negative delay jumps to the current point. */
  function syncRing(seg, t) {
    var ring = $('s-ring');
    var timed = seg.kind === 'inhale' || seg.kind === 'exhale';
    ring.style.animation = 'none';
    void ring.offsetWidth;
    ring.style.animation = '';
    ring.style.animationDuration = timed ? seg.duration + 's' : '';
    ring.style.animationDelay = '-' + Math.max(0, t - seg.start).toFixed(2) + 's';
  }

  function resyncRing() {
    if (!session) { return; }
    var sch = session.schedule;
    var idx = Schedule.segmentAt(sch, Player.time());
    if (idx < sch.segments.length) { syncRing(sch.segments[idx], Player.time()); }
  }

  /* Called when the page becomes visible again: the audio kept going, the display did not. */
  function resume() {
    if (!session) { return; }
    resyncRing();
    loop();
    if (State.settings.wakeLock) { Player.requestWakeLock(); }
  }

  function togglePause() {
    if (!session) { return; }
    if (Player.paused()) {
      setText('s-note', '');
      Player.resume().then(function () { Player.updatePosition(); resyncRing(); tick(); }).catch(function (err) {
        setText('s-note', 'Audio did not start (' + (err && err.name ? err.name : 'blocked') + '). Tap Resume again.');
      });
    } else {
      Player.pause();
      Player.updatePosition();
      tick();
    }
  }

  /* Lock-screen scrubbing; ignored during an attempt so the hold cannot be jumped to its limit. */
  function seekTo(t) {
    if (!session) { return; }
    var sch = session.schedule;
    var idx = Schedule.segmentAt(sch, Player.time());
    if (idx < sch.segments.length && attemptHold(sch.segments[idx])) { return; }
    session.from = Math.min(session.from, t);
    Player.seek(t);
    tick();
  }

  function skip() {
    if (!session) { return; }
    var sch = session.schedule;
    var idx = Schedule.segmentAt(sch, Player.time());
    if (idx < sch.segments.length && attemptHold(sch.segments[idx])) { return; }
    var next = sch.segments[idx + 1];
    Player.seek(next ? next.start : sch.total);
    session.lastIdx = -1;
    tick();
  }

  function previous() {
    if (!session) { return; }
    var sch = session.schedule;
    var t = Player.time();
    var idx = Schedule.segmentAt(sch, t);
    if (idx < sch.segments.length && attemptHold(sch.segments[idx])) { return; }
    var seg = sch.segments[Math.min(idx, sch.segments.length - 1)];
    var target = (t - seg.start < 2 && idx > 0) ? sch.segments[idx - 1].start : seg.start;
    session.from = Math.min(session.from, target);   // what gets played from here on counts
    Player.seek(target);
    session.lastIdx = -1;
    tick();
  }

  function record(position) {
    var e = SessionLog.entry(session.schedule, session.config, position, Date.now(), session.from);
    e.attempt = false;   // only finishAttempt logs a static; a chain stopped in its warm-up is a normal session
    if (!e.rounds && !e.completed) { return 0; }
    State.logSession(e);
    return e.at;
  }

  function end() {
    cancelAnimationFrame(rafId);
    session = null;
    disarmStop();
    Player.releaseWakeLock();
    Player.clearHandlers();
  }

  function stop() {
    if (!session) { return; }
    var sch = session.schedule;
    var t = Player.time();
    var idx = Schedule.segmentAt(sch, t);
    if (idx < sch.segments.length && attemptHold(sch.segments[idx]) && t - sch.segments[idx].start >= 3) { finishAttempt(t); return; }
    record(t);
    Player.stop();
    end();
    SetupView.refresh();
    UI.showView('setup');
  }

  /* First urge to breathe (contractions) during an attempt hold, in seconds into the hold. */
  function markUrge() {
    if (!session || session.urge) { return; }
    var sch = session.schedule;
    var t = Player.time();
    var seg = sch.segments[Schedule.segmentAt(sch, t)];
    if (!seg || !attemptHold(seg)) { return; }
    session.urge = Math.max(1, Math.round(t - seg.start));
    setText('s-note', 'Urge at ' + Schedule.fmt(session.urge));
    $('btn-urge').disabled = true;
  }

  /* Attempt holds end on the first Stop tap: seconds matter and the confirm step would cost them. */
  function stopTap(e) {
    if (!session) { return; }
    var sch = session.schedule;
    var t = Player.time();
    var idx = Schedule.segmentAt(sch, t);
    var seg = sch.segments[idx];
    if (idx < sch.segments.length && attemptHold(seg) && t - seg.start >= 3) {   // earlier than 3 s is a change of mind, handled by the confirm step
      e.stopImmediatePropagation();
      finishAttempt(t);
    }
  }

  /* Stop during the hold of an attempt: the hold so far is the result. */
  function finishAttempt(t) {
    var sch = session.schedule;
    var e = SessionLog.entry(sch, session.config, t, Date.now(), session.from);
    var seg = sch.segments[Math.min(Schedule.segmentAt(sch, t), sch.segments.length - 1)];
    e.completed = true;
    e.rounds = SessionLog.entry(sch, session.config, seg.end, e.at, session.from).rounds;   // as if the attempt hold ran to its end
    e.longest = Math.round(Math.min(t, seg.end) - seg.start);   // the attempt hold itself, not a longer warm-up hold
    if (session.urge) { e.urge = session.urge; }
    State.logSession(e);
    var best = e.longest > State.settings.maxStatic;
    if (best) { State.settings.maxStatic = e.longest; State.persist(); }
    if (t < sch.total) { Player.stop(); }   // at the limit the end chime plays out and the ended handler unloads
    end();
    DoneView.show(sch, e, best ? 'New max static' : 'Max static stays ' + Schedule.fmt(State.settings.maxStatic));
  }

  function finish() {
    if (!session) { return; }
    var sch = session.schedule;
    if (sch.attempt) { finishAttempt(sch.total); return; }
    var e = SessionLog.entry(sch, session.config, sch.total, Date.now(), session.from);
    e.at = record(sch.total);
    end();   // the end chime finishes on its own
    DoneView.show(sch, e, '');
  }

  function bind() {
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-prev').addEventListener('click', previous);
    $('btn-skip').addEventListener('click', skip);
    $('btn-urge').addEventListener('click', markUrge);
    $('btn-stop').addEventListener('click', stopTap);
    disarmStop = UI.armed($('btn-stop'), 'Confirm stop', stop);

    Player.on('ended', function () { if (session) { finish(); } Player.unload(); });
    Player.on('pause', function () { if (session) { tick(); } });
    Player.on('playing', function () { if (session) { setText('s-note', ''); resyncRing(); tick(); } });
    Player.on('timeupdate', function () { if (session && document.hidden) { tick(); } });
    Player.on('error', function () {
      if (session) { setText('s-note', 'Audio error. Stop and start the session again.'); }
    });
  }

  return {
    active: active,
    start: start,
    resume: resume,
    loop: loop,
    togglePause: togglePause,
    markUrge: markUrge,
    skip: skip,
    previous: previous,
    stop: stop,
    bind: bind
  };
})();
