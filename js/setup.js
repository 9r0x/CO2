/* Setup view: preset list, config form, preview and coaching hint. */
var SetupView = (function () {
  'use strict';

  var $ = UI.$;
  var el = UI.el;
  var LIMITS = Presets.LIMITS;

  /* ---------------- mode list ---------------- */

  function renderModes() {
    var list = $('mode-list');
    var currentId = State.current();
    var active = null;
    list.innerHTML = '';
    State.allPresetIds().forEach(function (id) {
      var c = State.data.configs[id];
      var b = el('button', 'mode' + (id === currentId ? ' active' : ''), c.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', id === currentId ? 'true' : 'false');
      b.addEventListener('click', function () { selectMode(id); });
      list.appendChild(b);
      if (id === currentId) { active = b; }
    });
    active.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function selectMode(id) {
    State.select(id);
    PresetActions.reset();
    refresh();
  }

  /* ---------------- form ---------------- */

  function makeStepper(field, value, limits, onChange) {
    var wrap = el('div', 'field stepper');
    var label = el('label', null, field.label);
    var inputId = 'f-' + field.key;
    label.htmlFor = inputId;
    wrap.appendChild(label);

    var control = el('div', 'control');
    var dec = el('button', 'btn', '−');
    dec.type = 'button';
    dec.setAttribute('aria-label', 'Decrease ' + field.label);
    var input = el('input');
    input.type = 'text';
    input.id = inputId;
    input.inputMode = field.kind === 'int' || field.kind === 'minutes' ? 'numeric' : 'text';
    var inc = el('button', 'btn', '+');
    inc.type = 'button';
    inc.setAttribute('aria-label', 'Increase ' + field.label);
    control.appendChild(dec);
    control.appendChild(input);
    control.appendChild(inc);
    wrap.appendChild(control);
    if (field.hint) { wrap.appendChild(el('p', 'hint', field.hint)); }

    var current = value;
    function set(v) {
      current = Schedule.clamp(Math.round(v), limits.min, limits.max);
      input.value = UI.formatValue(field.kind, current);
      onChange(current);
    }
    input.value = UI.formatValue(field.kind, current);
    UI.holdRepeat(dec, function () { set(current - limits.step); });
    UI.holdRepeat(inc, function () { set(current + limits.step); });
    input.addEventListener('change', function () {
      var v = UI.parseValue(field.kind, input.value);
      if (isNaN(v)) { input.value = UI.formatValue(field.kind, current); return; }
      set(v);
    });
    return wrap;
  }

  var TABLE_FIELDS = [
    { key: 'rounds', label: 'Rounds', kind: 'int' },
    { key: 'prep', label: 'Get ready', kind: 'time', hint: 'Countdown before the first round.' },
    { key: 'holdStart', label: 'Hold (round 1)', kind: 'time' },
    { key: 'holdStep', label: 'Hold change per round', kind: 'signed' },
    { key: 'breatheStart', label: 'Breathe (round 1)', kind: 'time' },
    { key: 'breatheStep', label: 'Breathe change per round', kind: 'signed' },
    { key: 'minimum', label: 'Minimum segment length', kind: 'time', hint: 'Breathe and hold never go below this.' }
  ];

  var ATTEMPT_FIELDS = [
    { key: 'prep', label: 'Get ready', kind: 'time' },
    { key: 'breatheStart', label: 'Breathe-up', kind: 'time', hint: 'Relaxed breathing before the hold.' },
    { key: 'holdStart', label: 'Hold limit', kind: 'time', hint: 'The audio ends here if you are still holding.' }
  ];

  var PATTERN_FIELDS = [
    { key: 'prep', label: 'Get ready', kind: 'time' },
    { key: 'minutes', label: 'Duration', kind: 'minutes', hint: 'Rounded to whole cycles.' }
  ];

  function renderForm() {
    var form = $('config-form');
    var c = State.cfg();
    form.innerHTML = '';

    if (Presets.isBuiltin(State.current())) {
      form.appendChild(el('h2', 'form-title', c.name));
    } else {
      var nameField = el('div', 'field');
      var nameLabel = el('label', null, 'Preset name');
      nameLabel.htmlFor = 'f-name';
      var nameInput = el('input');
      nameInput.type = 'text';
      nameInput.id = 'f-name';
      nameInput.maxLength = 40;
      nameInput.value = c.name;
      nameInput.addEventListener('change', function () {
        var v = nameInput.value.trim();
        if (v) { c.name = v; State.persist(); renderModes(); }
        else { nameInput.value = c.name; }
      });
      nameField.appendChild(nameLabel);
      nameField.appendChild(nameInput);
      form.appendChild(nameField);

      var whyField = el('div', 'field');
      var whyLabel = el('label', null, 'Description');
      whyLabel.htmlFor = 'f-why';
      var whyInput = el('input', 'wide');
      whyInput.type = 'text';
      whyInput.id = 'f-why';
      whyInput.maxLength = 200;
      whyInput.placeholder = 'Optional: what this is for, how it should feel';
      whyInput.value = c.why || '';
      whyInput.addEventListener('change', function () { c.why = whyInput.value.trim(); State.persist(); });
      whyField.appendChild(whyLabel);
      whyField.appendChild(whyInput);
      form.appendChild(whyField);
    }

    if (c.why && Presets.isBuiltin(State.current())) { form.appendChild(el('p', 'form-why', c.why)); }

    if (c.kind === 'chain') { form.appendChild(renderParts(c)); return; }
    var fields = c.kind !== 'table' ? PATTERN_FIELDS : (c.attempt ? ATTEMPT_FIELDS : (c.rows ? PATTERN_FIELDS.slice(0, 1) : TABLE_FIELDS));
    fields.forEach(function (f) {
      form.appendChild(makeStepper(f, c[f.key], LIMITS[f.key], function (v) {
        c[f.key] = v; State.persist(); renderPreview();
      }));
    });
    if (c.kind !== 'table') { form.appendChild(renderPhases(c)); }
    else if (c.rows) { form.appendChild(renderRows(c)); }
    else if (!c.attempt) { form.appendChild(renderSuggest(c)); form.appendChild(renderRowsSwitch(c)); }
  }

  function renderSuggest(c) {
    var wrap = el('div', 'field suggest');
    wrap.appendChild(el('span', null, 'Suggest from your max static'));
    var control = el('div', 'control');
    var input = el('input');
    input.type = 'text';
    input.placeholder = 'e.g. 3:00';
    input.value = State.settings.maxStatic ? Schedule.fmt(State.settings.maxStatic) : '';
    input.setAttribute('aria-label', 'Max static breath-hold');
    var btn = el('button', 'btn', 'Apply');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Apply suggestion from max static');
    btn.addEventListener('click', function () {
      var pb = Schedule.parse(input.value);
      if (isNaN(pb) || pb < 30) { input.value = ''; input.placeholder = 'e.g. 3:00'; return; }
      var s = Presets.suggestFromMax(State.current() === 'o2' || c.holdStep > 0 ? 'o2' : 'co2', pb);
      Object.keys(s).forEach(function (k) { c[k] = s[k]; });
      State.settings.maxStatic = pb;
      State.persist();
      renderForm();
      renderPreview();
    });
    control.appendChild(input);
    control.appendChild(btn);
    wrap.appendChild(control);
    wrap.appendChild(el('p', 'hint', 'Common rules of thumb (CO2: hold at 50 percent of max; O2: holds from 40 to 80 percent). Adjust to how you feel.'));
    return wrap;
  }

  function renderPhases(c) {
    var wrap = el('div', 'field');
    wrap.appendChild(el('span', null, 'Phases'));
    var lim = LIMITS.phaseSeconds;

    c.phases.forEach(function (phase, idx) {
      var row = el('div', 'phase-row');
      var select = el('select');
      select.setAttribute('aria-label', 'Phase ' + (idx + 1) + ' type');
      Presets.PHASE_LABELS.forEach(function (labelText) {
        var opt = el('option', null, labelText);
        opt.value = labelText;
        if (labelText === phase.label) { opt.selected = true; }
        select.appendChild(opt);
      });
      select.addEventListener('change', function () { phase.label = select.value; State.persist(); renderPreview(); });
      row.appendChild(select);

      var stepper = el('div', 'stepper-inline');
      var dec = el('button', 'btn', '−'); dec.type = 'button';
      dec.setAttribute('aria-label', 'Decrease seconds');
      var input = el('input'); input.type = 'text'; input.inputMode = 'numeric';
      input.setAttribute('aria-label', 'Phase ' + (idx + 1) + ' seconds');
      var inc = el('button', 'btn', '+'); inc.type = 'button';
      inc.setAttribute('aria-label', 'Increase seconds');
      function set(v) {
        phase.seconds = Schedule.clamp(Math.round(v), lim.min, lim.max);
        input.value = phase.seconds + ' s';
        State.persist();
        renderPreview();
      }
      input.value = phase.seconds + ' s';
      UI.holdRepeat(dec, function () { set(phase.seconds - lim.step); });
      UI.holdRepeat(inc, function () { set(phase.seconds + lim.step); });
      input.addEventListener('change', function () {
        var v = UI.parseValue('seconds', input.value);
        if (isNaN(v)) { input.value = phase.seconds + ' s'; return; }
        set(v);
      });
      stepper.appendChild(dec); stepper.appendChild(input); stepper.appendChild(inc);
      row.appendChild(stepper);

      var remove = el('button', 'btn remove', 'Remove'); remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove phase ' + (idx + 1));
      remove.disabled = c.phases.length <= 1;
      remove.addEventListener('click', function () {
        c.phases.splice(idx, 1); State.persist(); renderForm(); renderPreview();
      });
      row.appendChild(remove);
      wrap.appendChild(row);
    });

    var add = el('button', 'btn', 'Add phase'); add.type = 'button';
    add.disabled = c.phases.length >= LIMITS.maxPhases;
    add.addEventListener('click', function () {
      var last = c.phases[c.phases.length - 1];
      c.phases.push({ label: last && last.label === 'Inhale' ? 'Exhale' : 'Inhale', seconds: last ? last.seconds : 4 });
      State.persist(); renderForm(); renderPreview();
    });
    wrap.appendChild(add);
    return wrap;
  }

  /* Switch from the formula to editing every round by hand, starting from the rows the formula gives. */
  function renderRowsSwitch(c) {
    var wrap = el('div', 'field');
    var btn = el('button', 'btn', 'Edit rounds one by one'); btn.type = 'button';
    btn.addEventListener('click', function () {
      c.rows = Schedule.tableRounds(c).map(function (r) { return { breathe: r.breathe, hold: r.hold }; });
      c.rounds = c.rows.length;
      State.persist(); renderForm(); renderPreview();
    });
    wrap.appendChild(btn);
    wrap.appendChild(el('p', 'hint', 'For pyramids and other shapes the formula cannot make.'));
    return wrap;
  }

  function timeInput(labelText, value, onChange) {
    var input = el('input');
    input.type = 'text';
    input.inputMode = 'text';
    input.value = Schedule.fmt(value);
    input.setAttribute('aria-label', labelText);
    input.addEventListener('change', function () {
      var v = Schedule.parse(input.value);
      if (isNaN(v)) { input.value = Schedule.fmt(value); return; }
      value = Schedule.clamp(Math.round(v), LIMITS.roundSeconds.min, LIMITS.roundSeconds.max);
      input.value = Schedule.fmt(value);
      onChange(value);
    });
    return input;
  }

  function renderRows(c) {
    var wrap = el('div', 'field');
    var head = el('div', 'rows-head');
    ['', 'Breathe', 'Hold'].forEach(function (h) { head.appendChild(el('span', null, h)); });
    wrap.appendChild(head);
    c.rows.forEach(function (row, idx) {
      var line = el('div', 'rows-line');
      line.appendChild(el('span', 'part-no', String(idx + 1)));
      line.appendChild(timeInput('Round ' + (idx + 1) + ' breathe', row.breathe, function (v) { row.breathe = v; State.persist(); renderPreview(); }));
      line.appendChild(timeInput('Round ' + (idx + 1) + ' hold', row.hold, function (v) { row.hold = v; State.persist(); renderPreview(); }));
      wrap.appendChild(line);
    });
    var actions = el('div', 'row wrap');
    var add = el('button', 'btn', 'Add round'); add.type = 'button';
    add.disabled = c.rows.length >= LIMITS.rounds.max;
    add.addEventListener('click', function () {
      var last = c.rows[c.rows.length - 1];
      c.rows.push({ breathe: last.breathe, hold: last.hold });
      c.rounds = c.rows.length;
      State.persist(); renderForm(); renderPreview();
    });
    var drop = el('button', 'btn', 'Remove last'); drop.type = 'button';
    drop.disabled = c.rows.length <= 1;
    drop.addEventListener('click', function () {
      c.rows.pop();
      c.rounds = c.rows.length;
      State.persist(); renderForm(); renderPreview();
    });
    var back = el('button', 'btn', 'Back to the formula'); back.type = 'button';
    back.addEventListener('click', function () {
      delete c.rows;
      State.persist(); renderForm(); renderPreview();
    });
    actions.appendChild(add); actions.appendChild(drop); actions.appendChild(back);
    wrap.appendChild(actions);
    wrap.appendChild(el('p', 'hint', 'Type times as 1:30 or 90. Back to the formula drops these rows.'));
    return wrap;
  }

  /* Presets that can be a part of a chain: everything except other chains. */
  function partChoices() {
    return State.allPresetIds().filter(function (id) { return State.config(id).kind !== 'chain'; });
  }

  function renderParts(c) {
    var wrap = el('div', 'field');
    wrap.appendChild(el('span', null, 'Parts, in order'));
    var choices = partChoices();
    c.items.forEach(function (id, idx) {
      if (choices.indexOf(id) < 0) { id = c.items[idx] = choices[0]; State.persist(); }
      var row = el('div', 'part-row');
      // The position is a small select: picking another number moves the part there.
      var pos = el('select', 'part-no');
      pos.setAttribute('aria-label', 'Position of part ' + (idx + 1));
      c.items.forEach(function (unused, n) {
        var o = el('option', null, String(n + 1));
        o.value = String(n);
        if (n === idx) { o.selected = true; }
        pos.appendChild(o);
      });
      pos.addEventListener('change', function () {
        var moved = c.items.splice(idx, 1)[0];
        c.items.splice(parseInt(pos.value, 10), 0, moved);
        State.persist(); renderForm(); renderPreview();
      });
      row.appendChild(pos);
      var select = el('select');
      select.setAttribute('aria-label', 'Part ' + (idx + 1));
      choices.forEach(function (cid) {
        var opt = el('option', null, State.config(cid).name);
        opt.value = cid;
        if (cid === id) { opt.selected = true; }
        select.appendChild(opt);
      });
      select.addEventListener('change', function () { c.items[idx] = select.value; State.persist(); renderPreview(); });
      row.appendChild(select);
      var remove = el('button', 'btn remove', 'Remove'); remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove part ' + (idx + 1));
      remove.disabled = c.items.length <= 1;
      remove.addEventListener('click', function () { c.items.splice(idx, 1); State.persist(); renderForm(); renderPreview(); });
      row.appendChild(remove);
      wrap.appendChild(row);
    });
    var add = el('button', 'btn', 'Add part'); add.type = 'button';
    add.disabled = c.items.length >= LIMITS.maxParts;
    add.addEventListener('click', function () { c.items.push(choices[0]); State.persist(); renderForm(); renderPreview(); });
    wrap.appendChild(add);
    wrap.appendChild(el('p', 'hint', 'Each part keeps its own settings; pick it in the list above to edit it. A max static attempt counts only as the last part, after any warm-up holds.'));
    return wrap;
  }

  /* ---------------- preview ---------------- */

  function validate(schedule) {
    if (!schedule.segments.length) { return schedule.kind === 'chain' ? 'Add at least one part.' : 'Add at least one phase with a duration.'; }
    if (schedule.total > LIMITS.maxSessionSeconds) {
      return 'Sessions are limited to ' + (LIMITS.maxSessionSeconds / 60) + ' minutes of audio. Shorten it or split it.';
    }
    return '';
  }

  function renderPreview() {
    var box = $('preview');
    var c = State.cfg();
    var schedule = Schedule.build(c, State.config);
    box.innerHTML = '';

    if (c.kind === 'chain') {
      var list = el('ol', 'preview-list');
      schedule.parts.forEach(function (part, idx) {
        var first = schedule.segments.filter(function (s) { return s.part === idx; })[0];
        list.appendChild(startRow('li', part.name + ', ' + Schedule.fmt(Schedule.build(part).total), first.start, idx > 0, part.name));
      });
      box.appendChild(list);
      if (schedule.parts.length > 1) { box.appendChild(el('p', 'hint', 'Tap a part to start from it.')); }
    } else if (c.attempt) {
      box.appendChild(el('p', null, 'Breathe ' + Schedule.fmt(c.breatheStart) + ', then hold. The timer counts up and ticks every ' + (State.settings.holdTicks || 30) + ' s.'));
      box.appendChild(el('p', 'preview-total', State.settings.maxStatic
        ? 'Current max static ' + Schedule.fmt(State.settings.maxStatic)
        : 'No max static recorded yet.'));
    } else if (c.kind === 'table') {
      var table = el('table', 'preview-table');
      var thead = el('thead');
      var hr = el('tr');
      ['Round', 'Breathe', 'Hold'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el('tbody');
      Schedule.tableRounds(c).forEach(function (r) {
        var first = schedule.segments.filter(function (s) { return s.round === r.round; })[0];
        var tr = startRow('tr', null, first.start, r.round > 1, 'round ' + r.round);
        tr.appendChild(el('td', null, String(r.round)));
        tr.appendChild(el('td', null, Schedule.fmt(r.breathe)));
        tr.appendChild(el('td', null, Schedule.fmt(r.hold)));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.appendChild(table);
      if (!c.attempt && schedule.rounds > 1) { box.appendChild(el('p', 'hint', 'Tap a round to start from it.')); }
    } else {
      var phases = c.phases.filter(function (p) { return p.seconds > 0; });
      var cycleLen = Schedule.cycleLength(phases);
      var list = el('ul', 'preview-list');
      phases.forEach(function (p) { list.appendChild(el('li', null, p.label + ' ' + p.seconds + ' s')); });
      box.appendChild(list);
      box.appendChild(el('p', 'preview-total', schedule.rounds + ' cycles of ' + cycleLen + ' s'));
    }

    if (!c.attempt) {
      box.appendChild(renderTimeline(c, schedule));
      box.appendChild(el('p', 'preview-total', 'Total time ' + Schedule.fmt(schedule.total)
        + (c.prep ? ' including ' + c.prep + ' s to get ready' : '')));
      box.appendChild(el('p', 'hint', 'Ends around ' + UI.clock(Date.now() + schedule.total * 1000) + ' if you start now.'));
    }

    var note = $('setup-note');
    var problem = validate(schedule);
    note.hidden = !problem;
    note.textContent = problem || '';
    $('btn-start').disabled = !!problem;
  }

  /* A preview line that starts the session at a later point when tapped. */
  function startRow(tag, text, at, live, name) {
    var node = el(tag, live ? 'start-row' : null, text);
    if (!live) { return node; }
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', 'Start from ' + name);
    node.tabIndex = 0;
    node.title = 'Start from here';
    function go() { if (!$('btn-start').disabled) { SessionView.start(State.cfg(), at); } }
    node.addEventListener('click', go);
    node.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return node;
  }

  /* Proportional strip: the whole session for tables, one cycle for patterns. */
  function renderTimeline(c, schedule) {
    var strip = el('div', 'timeline');
    strip.setAttribute('role', 'img');
    var segs = c.kind === 'pattern'
      ? schedule.segments.filter(function (s) { return s.round === 1; })
      : schedule.segments.filter(function (s) { return s.partKind !== 'pattern' || s.partRound <= 1; });
    strip.setAttribute('aria-label', c.kind === 'pattern' ? 'One cycle' : 'Session timeline');
    segs.forEach(function (s) {
      var kind = s.partKind || c.kind;
      var cycles = kind === 'pattern' && s.partRound === 1 && c.kind === 'chain' ? s.partRounds : 1;   // a pattern part shows one cycle, stretched to its length
      var part = el('span', 'tl-' + s.kind);
      part.style.flexGrow = String(s.duration * cycles);
      part.title = (s.partName ? s.partName + ' ' : '')
        + (s.round ? (kind === 'table' ? 'Round ' : 'Cycle ') + (s.partRound || s.round) + ' ' : '')
        + s.label + ' ' + Schedule.fmt(s.duration) + (cycles > 1 ? ' (' + cycles + ' cycles)' : '');
      strip.appendChild(part);
    });
    return strip;
  }

  /* A nudge from the ratings of recent sessions on this preset. */
  /* The step the Apply button makes: 15 s more hold on a table, one more minute on a pattern. */
  function coachStep(c) {
    if (c.kind === 'table') { return c.attempt ? '' : 'hold +15 s'; }
    return c.kind === 'pattern' ? 'duration +1 min' : '';
  }

  function latestEntryAt() {
    var mine = State.data.history.filter(function (e) { return e.id === State.current(); });
    return mine.length ? mine[0].at : 0;
  }

  function applyCoach() {
    var c = State.cfg();
    if (c.rows) { c.rows.forEach(function (r) { r.hold = Schedule.clamp(r.hold + 15, LIMITS.roundSeconds.min, LIMITS.roundSeconds.max); }); }
    else if (c.kind === 'table') { c.holdStart = Schedule.clamp(c.holdStart + 15, LIMITS.holdStart.min, LIMITS.holdStart.max); }
    else { c.minutes = Schedule.clamp(c.minutes + 1, LIMITS.minutes.min, LIMITS.minutes.max); }
    c.coachedAt = latestEntryAt();   // the same three sessions must not suggest the step again
    State.persist();
    $('setup-coach').hidden = true;
    renderForm();
    renderPreview();
  }

  function renderCoach() {
    var coach = $('setup-coach');
    var c = State.cfg();
    var recent = SessionLog.lastRatings(State.data.history, State.current(), 3);
    var text = '';
    var step = '';
    if (recent.length === 3 && recent.every(function (r) { return r === 'easy'; }) && c.coachedAt !== latestEntryAt()) {
      step = coachStep(c);
      text = 'Your last three sessions here felt easy.' + (step ? ' Apply makes it ' + step + '.' : '');
    } else if (recent.length >= 2 && recent[0] === 'hard' && recent[1] === 'hard') {
      text = 'The last two sessions here felt hard. Keep these settings a while longer, or ease off a little.';
    }
    coach.hidden = !text;
    UI.setText('coach-text', text);
    $('btn-coach-apply').hidden = !step;
  }

  function refresh() {
    PresetActions.importFromHash();   // a link opened during a session waits here until the setup view returns
    $('tip').hidden = !!State.settings.tipSeen;
    var builtin = Presets.isBuiltin(State.current());
    renderModes();
    renderForm();
    renderPreview();
    renderCoach();
    $('btn-reset-preset').hidden = !builtin;
    $('btn-delete-preset').hidden = builtin;
  }

  function bind() {
    $('btn-start').addEventListener('click', function () { SessionView.start(State.cfg()); });
    $('btn-tip-ok').addEventListener('click', function () { State.settings.tipSeen = true; State.persist(); $('tip').hidden = true; });
    $('btn-tip-guide').addEventListener('click', function () { SettingsView.render(); UI.showView('settings'); $('cue-guide').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    $('btn-coach-apply').addEventListener('click', applyCoach);
    $('config-form').addEventListener('submit', function (e) { e.preventDefault(); });
  }

  return {
    refresh: refresh,
    select: selectMode,
    bind: bind
  };
})();
