/* Settings view. */
var SettingsView = (function () {
  'use strict';

  var $ = UI.$;

  function render() {
    var s = State.settings;
    $('set-volume').value = s.volume;
    $('set-countdown').checked = !!s.countdown;
    $('set-holdticks').value = String(s.holdTicks);
    $('set-wakelock').checked = !!s.wakeLock && ('wakeLock' in navigator);
    $('set-mix').checked = !!s.mix;
    $('set-vibrate').checked = !!s.vibrate && ('vibrate' in navigator);
    $('set-vibrate').disabled = !('vibrate' in navigator);
    $('set-tones').value = s.tones;
    $('set-goal').value = String(s.goalMinutes);
    $('set-theme').value = s.theme;
    $('set-wakelock').disabled = !('wakeLock' in navigator);
    $('set-mix').disabled = !('audioSession' in navigator);
  }

  var GUIDE = [
    ['prep', 'Get ready', 'One short note; the get-ready countdown before a session or a part starts'],
    ['breathe', 'Breathe', 'Two rising notes; relax and breathe'],
    ['hold', 'Hold', 'One long low tone; the hold starts'],
    ['inhale', 'Inhale', 'A rising sweep'],
    ['exhale', 'Exhale', 'A falling sweep'],
    ['hold-in', 'Hold after inhale', 'A short high note'],
    ['hold-out', 'Hold after exhale', 'A short low note'],
    ['tick', 'Countdown', 'Three ticks in the last seconds of a segment'],
    ['holdtick', 'Hold tick', 'A quiet tick at the chosen interval during holds'],
    ['done', 'Done', 'Three ascending notes; the session is over']
  ];

  function fillGuide() {
    var box = $('cue-guide');
    GUIDE.forEach(function (g) {
      var row = UI.el('div', 'guide-row');
      var text = UI.el('div', 'guide-text');
      text.appendChild(UI.el('div', 'guide-name', g[1]));
      text.appendChild(UI.el('div', 'guide-desc', g[2]));
      row.appendChild(text);
      var btn = UI.el('button', 'btn', 'Play');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Play the ' + g[1] + ' cue');
      btn.addEventListener('click', function () {
        if (SessionView.active()) { return; }
        Player.playCue(g[0], Object.assign({}, State.settings, { volume: parseFloat($('set-volume').value) })).catch(function () {});
      });
      row.appendChild(btn);
      box.appendChild(row);
    });
  }

  function fillToneSets() {
    var select = $('set-tones');
    Tones.SET_ORDER.forEach(function (id) {
      var opt = UI.el('option', null, Tones.SETS[id].name);
      opt.value = id;
      select.appendChild(opt);
    });
  }

  function exportFile() {
    var name = 'breath-trainer-' + new Date().toISOString().slice(0, 10) + '.json';
    UI.download(name, State.exportText(), 'application/json');
    UI.setText('backup-note', 'Saved ' + name + '.');
  }

  function importFile() {
    var file = this.files[0];
    this.value = '';
    if (!file) { return; }
    file.text().then(function (text) {
      var obj;
      try { obj = JSON.parse(text); } catch (e) { obj = null; }
      if (!State.importData(obj)) {
        UI.setText('backup-note', 'That file is not a Breath Trainer backup.');
        return;
      }
      window.location.reload();
    });
  }

  function bind() {
    var s = State.settings;
    fillToneSets();
    fillGuide();
    $('set-volume').addEventListener('change', function () { s.volume = parseFloat(this.value); State.persist(); });
    $('set-countdown').addEventListener('change', function () { s.countdown = this.checked; State.persist(); });
    $('set-holdticks').addEventListener('change', function () { s.holdTicks = parseInt(this.value, 10); State.persist(); });
    $('set-wakelock').addEventListener('change', function () { s.wakeLock = this.checked; State.persist(); });
    $('set-mix').addEventListener('change', function () { s.mix = this.checked; State.persist(); });
    $('set-vibrate').addEventListener('change', function () { s.vibrate = this.checked; State.persist(); });
    $('btn-export').addEventListener('click', exportFile);
    $('btn-import').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', importFile);
    $('set-tones').addEventListener('change', function () { s.tones = this.value; State.persist(); });
    $('set-goal').addEventListener('change', function () { s.goalMinutes = parseInt(this.value, 10); State.persist(); });
    $('set-theme').addEventListener('change', function () { s.theme = this.value; State.persist(); UI.applyTheme(s.theme); });
    $('btn-test-tone').addEventListener('click', function () {
      if (SessionView.active()) { return; }
      Player.playTest(Object.assign({}, s, { volume: parseFloat($('set-volume').value) })).catch(function () {});
    });
    UI.armed($('btn-reset-all'), 'Tap again to confirm reset', State.reset);
  }

  return { render: render, bind: bind };
})();
