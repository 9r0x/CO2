/* End-to-end scenarios for test/browser.js. Each gets a page helper (see makePage there). */
'use strict';
var assert = require('assert');

var SEED = 'localStorage.setItem("breathtrainer.v1", JSON.stringify(%s));';

function seed(obj) { return SEED.replace('%s', JSON.stringify(obj)); }

module.exports = [
  {
    name: 'walkthrough: setup, session controls, done view, pattern mode',
    run: async function (p) {
      await p.open();
      assert.strictEqual(await p.count('.mode'), 9);
      assert.ok((await p.text('#preview')).indexOf('Total time 21:10') > -1);

      await p.click('#btn-start'); await p.sleep(1200);
      assert.strictEqual(await p.hidden('#view-session'), false);
      assert.strictEqual(await p.evaluate('document.getElementById("audio").paused'), false);
      assert.ok(await p.evaluate('document.getElementById("audio").currentTime') > 0.5, 'audio clock runs');
      assert.strictEqual(await p.text('#s-phase'), 'Get ready');
      assert.strictEqual(await p.text('#s-round'), '8 rounds');
      assert.strictEqual(await p.evaluate('navigator.mediaSession.metadata.title'), 'CO2 table');
      assert.ok((await p.evaluate('navigator.mediaSession.metadata.artwork[0].src')).indexOf('data:image/png') === 0, 'lock screen artwork');

      await p.click('#btn-skip'); await p.sleep(400);
      assert.strictEqual(await p.text('#s-phase'), 'Breathe');
      assert.strictEqual(await p.text('#s-round'), 'Round 1 of 8');
      await p.click('#btn-skip'); await p.sleep(400);
      assert.strictEqual(await p.text('#s-phase'), 'Hold');
      assert.strictEqual(await p.text('#s-next'), 'Next: Breathe 1:45');
      assert.strictEqual(await p.evaluate('[...document.querySelectorAll("#s-pips .pip")].map(function(x){return x.className}).join()'), 'pip now,pip,pip,pip,pip,pip,pip,pip');

      await p.click('#btn-pause'); await p.sleep(300);
      var t1 = await p.evaluate('document.getElementById("audio").currentTime');
      await p.sleep(700);
      var t2 = await p.evaluate('document.getElementById("audio").currentTime');
      assert.strictEqual(t1, t2, 'paused clock is frozen');
      assert.strictEqual(await p.text('#btn-pause'), 'Resume');
      await p.click('#btn-pause'); await p.sleep(300);
      assert.strictEqual(await p.text('#btn-pause'), 'Pause');

      await p.click('#btn-stop'); await p.sleep(100);
      assert.strictEqual(await p.text('#btn-stop'), 'Confirm stop');
      await p.click('#btn-stop'); await p.sleep(300);
      assert.strictEqual(await p.hidden('#view-setup'), false);
      assert.strictEqual(await p.evaluate('document.getElementById("audio").paused'), true);

      await p.click('#btn-start'); await p.sleep(500);
      await p.evaluate('document.getElementById("audio").currentTime = 1269.8'); await p.sleep(800);
      assert.strictEqual(await p.hidden('#view-done'), false);
      var summary = await p.text('#done-summary');
      assert.ok(summary.indexOf('Rounds8') > -1 && summary.indexOf('Time on hold12:00') > -1, summary);
      assert.ok(summary.indexOf('Preset') === 0, summary);
      assert.strictEqual(await p.evaluate('document.getElementById("audio").paused'), false, 'end chime keeps playing');
      await p.sleep(2200);
      assert.strictEqual(await p.evaluate('document.getElementById("audio").readyState'), 0, 'track unloaded after the chime');
      await p.click('#btn-again'); await p.sleep(600);
      assert.strictEqual(await p.hidden('#view-session'), false, 'Again starts a fresh session');
      assert.strictEqual(await p.text('#s-phase'), 'Get ready');
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(200);

      // Tap a round in the preview to start there
      assert.strictEqual(await p.count('.preview-table .start-row'), 7, 'every round but the first is a start point');
      await p.evaluate('document.querySelectorAll(".preview-table tbody tr")[4].click()'); await p.sleep(900);
      assert.strictEqual(await p.hidden('#view-session'), false);
      assert.strictEqual(await p.text('#s-round'), 'Round 5 of 8');
      assert.strictEqual(await p.text('#s-phase'), 'Breathe');
      assert.ok(await p.evaluate('document.getElementById("audio").currentTime') > 520, 'audio seeked to round 5');
      await p.evaluate('document.getElementById("audio").currentTime = 1269.8'); await p.sleep(800);
      var late = JSON.parse(await p.evaluate('JSON.stringify(State.data.history[0])'));
      assert.strictEqual(late.rounds, 4, 'four rounds were played');
      await p.sleep(2200);
      await p.click('#btn-back'); await p.sleep(200);
      await p.evaluate('document.querySelectorAll(".preview-table tbody tr")[4].click()'); await p.sleep(900);
      await p.evaluate('document.getElementById("audio").currentTime = 760.3'); await p.sleep(200);   // round 5 starts at 760
      await p.click('#btn-prev'); await p.sleep(300);
      assert.strictEqual(await p.text('#s-round'), 'Round 4 of 8', 'Back within 2 s moved before the start point');
      await p.evaluate('document.getElementById("audio").currentTime = 1269.8'); await p.sleep(800);
      var back = JSON.parse(await p.evaluate('JSON.stringify(State.data.history[0])'));
      assert.strictEqual(back.rounds, 5, 'the round reached through Back counts too');
      assert.strictEqual(back.hold, 5 * 90);
      assert.strictEqual(late.hold, 4 * 90, 'only the four rounds played count');
      assert.strictEqual(back.completed, true);
      var doneText = await p.text('#done-summary');
      assert.ok(doneText.indexOf('Rounds5 of 8') > -1 && doneText.indexOf('Total time') > -1 && doneText.indexOf('21:10') === -1, 'Done view matches the log: ' + doneText);
      assert.strictEqual(await p.evaluate('document.querySelector("#nav-setup").getAttribute("aria-current")'), 'false');
      await p.sleep(2200);
      await p.click('#btn-back'); await p.sleep(200);

      await p.mode('Scuba 4-6'); await p.sleep(200);
      assert.ok((await p.text('#preview')).indexOf('30 cycles of 10 s') > -1);
      await p.click('#btn-start'); await p.sleep(400);
      await p.click('#btn-skip'); await p.sleep(400);
      assert.strictEqual(await p.text('#s-phase'), 'Inhale');
      assert.strictEqual(await p.text('#s-round'), 'Cycle 1 of 30');
      assert.strictEqual(await p.count('#s-pips .pip'), 0, 'no pips for long pattern sessions');
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(200);
    }
  },
  {
    name: 'setup: steppers, typed values, presets, persistence across reload',
    run: async function (p) {
      await p.open();
      await p.evaluate('document.querySelector("#f-holdStart").parentElement.querySelector("button").click()');
      await p.set('#f-rounds', '10'); await p.sleep(300);
      assert.strictEqual(await p.value('#f-holdStart'), '1:25');
      assert.strictEqual(await p.count('.preview-table tbody tr'), 10);
      await p.set('#f-holdStart', 'abc'); await p.sleep(100);
      assert.strictEqual(await p.value('#f-holdStart'), '1:25', 'bad input is reverted');

      await p.click('#btn-save-preset'); await p.sleep(100);
      assert.strictEqual(await p.hidden('#save-row'), false);
      await p.click('#btn-save-cancel');
      assert.strictEqual(await p.hidden('#save-row'), true, 'Cancel closes the row');
      await p.click('#btn-share'); await p.sleep(100);
      await p.evaluate('Object.defineProperty(navigator, "clipboard", { value: { writeText: function () { return Promise.resolve(); } }, configurable: true })');
      await p.click('#btn-share-copy'); await p.sleep(300);
      assert.strictEqual(await p.text('#btn-share-copy'), 'Copied');
      await p.click('#btn-share-close');
      await p.click('#btn-reset-preset'); await p.sleep(200);
      assert.strictEqual(await p.value('#f-rounds'), '8', 'Reset to default restores the formula');
      assert.strictEqual(await p.value('#f-holdStart'), '1:30');
      await p.set('#f-rounds', '10'); await p.sleep(200);
      await p.click('#btn-save-preset');
      await p.evaluate('document.getElementById("preset-name").value = "My CO2"');
      await p.evaluate('document.getElementById("preset-name").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))'); await p.sleep(300);
      assert.strictEqual(await p.text('.mode.active'), 'My CO2');
      assert.strictEqual(await p.hidden('#btn-delete-preset'), false);
      await p.set('#f-why', 'Tuesday table'); await p.sleep(100);
      assert.strictEqual(await p.evaluate('State.cfg().why'), 'Tuesday table');
      await p.click('#btn-share'); await p.sleep(100);
      assert.strictEqual(await p.evaluate('Presets.decodeShare(document.getElementById("share-url").value.split("#p=")[1]).why'), 'Tuesday table');
      await p.click('#btn-share-close');

      await p.click('#btn-delete-preset'); await p.sleep(100);
      assert.strictEqual(await p.text('#btn-delete-preset'), 'Tap again to delete');
      await p.mode('My CO2'); await p.sleep(100);
      assert.strictEqual(await p.text('#btn-delete-preset'), 'Delete preset', 'arming is cancelled by any mode tap');

      await p.evaluate('location.reload()'); await p.sleep(900);
      assert.strictEqual(await p.text('.mode.active'), 'My CO2');
      assert.strictEqual(await p.value('#f-rounds'), '10');
      await p.click('#btn-delete-preset'); await p.click('#btn-delete-preset'); await p.sleep(300);
      assert.strictEqual(await p.count('.mode'), 9);
      assert.strictEqual(await p.text('.mode.active'), 'CO2 table');
    }
  },
  {
    name: 'tables: rounds edited one by one, pyramid shape, share link, coach',
    run: async function (p) {
      await p.open();
      await p.evaluate('[...document.querySelectorAll("#config-form .btn")].find(function(b){return b.textContent==="Edit rounds one by one"}).click()'); await p.sleep(200);
      assert.strictEqual(await p.count('.rows-line'), 8);
      assert.strictEqual(await p.count('#f-holdStart'), 0, 'formula fields are gone');
      assert.strictEqual(await p.count('#f-prep'), 1, 'Get ready stays');
      await p.evaluate('var i = document.querySelectorAll(".rows-line input")[1]; i.value = "2:30"; i.dispatchEvent(new Event("change"))'); await p.sleep(200);
      assert.strictEqual(await p.evaluate('State.cfg().rows[0].hold'), 150);
      assert.ok((await p.text('.preview-table')).indexOf('2:30') > -1);
      await p.evaluate('[...document.querySelectorAll("#config-form .btn")].find(function(b){return b.textContent==="Remove last"}).click()'); await p.sleep(200);
      assert.strictEqual(await p.count('.rows-line'), 7);
      assert.strictEqual(await p.evaluate('State.cfg().rounds'), 7);
      assert.ok((await p.text('#preview')).indexOf('Total time') > -1);
      await p.evaluate('var i = document.querySelectorAll(".rows-line input")[0]; i.value = "abc"; i.dispatchEvent(new Event("change"))'); await p.sleep(100);
      assert.strictEqual(await p.evaluate('document.querySelectorAll(".rows-line input")[0].value'), '2:00', 'bad input reverts');

      await p.click('#btn-share'); await p.sleep(100);
      var url = await p.value('#share-url');
      var back = JSON.parse(await p.evaluate('JSON.stringify(Presets.decodeShare(' + JSON.stringify(url.split('#p=')[1]) + '))'));
      assert.strictEqual(back.rows.length, 7);
      assert.strictEqual(back.rows[0].hold, 150);
      await p.click('#btn-share-close');

      await p.evaluate('location.reload()'); await p.sleep(900);
      assert.strictEqual(await p.count('.rows-line'), 7, 'rows persist');
      await p.click('#btn-start'); await p.sleep(400);
      await p.evaluate('document.getElementById("audio").currentTime = 131'); await p.sleep(400);
      assert.strictEqual(await p.text('#s-phase'), 'Hold');
      assert.strictEqual(await p.text('#s-time'), '2:29', 'the session uses the edited row');
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(200);

      await p.evaluate('[...document.querySelectorAll("#config-form .btn")].find(function(b){return b.textContent==="Back to the formula"}).click()'); await p.sleep(200);
      assert.strictEqual(await p.count('.rows-line'), 0);
      assert.strictEqual(await p.count('#f-holdStart'), 1);
      assert.strictEqual(await p.evaluate('State.cfg().rows'), undefined);
    }
  },
  {
    name: 'history: stopped and finished sessions, stats, ratings, coach hint, clear',
    run: async function (p) {
      await p.open();
      await p.click('#btn-start'); await p.sleep(400);
      await p.evaluate('document.getElementById("audio").currentTime = 400'); await p.sleep(400);
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(300);
      var h = await p.evaluate('JSON.stringify(State.data.history)');
      var e = JSON.parse(h)[0];
      assert.strictEqual(e.rounds, 1, 'round 2 hold is still running at 400 s');
      assert.strictEqual(e.completed, false);
      assert.strictEqual(e.hold, 90 + (400 - 325));

      for (var k = 0; k < 3; k++) {
        await p.click('#btn-start'); await p.sleep(400);
        await p.evaluate('document.getElementById("audio").currentTime = 1269.8'); await p.sleep(700);
        await p.click('#done-rate [data-rating="easy"]'); await p.sleep(100);
        assert.strictEqual(await p.evaluate('State.data.history[0].rating'), 'easy');
        assert.ok(/^(Share|Copy summary)$/.test(await p.text('#btn-share-result')));
        await p.click('#btn-back'); await p.sleep(200);
      }
      assert.strictEqual(await p.hidden('#setup-coach'), false);
      assert.ok((await p.text('#coach-text')).indexOf('felt easy') > -1);
      assert.strictEqual(await p.hidden('#btn-coach-apply'), false);
      await p.click('#btn-coach-apply'); await p.sleep(200);
      assert.strictEqual(await p.value('#f-holdStart'), '1:45', 'Apply adds 15 s of hold');
      assert.strictEqual(await p.hidden('#setup-coach'), true);
      await p.evaluate('location.reload()'); await p.sleep(900);
      assert.strictEqual(await p.value('#f-holdStart'), '1:45', 'applied change persists');
      assert.strictEqual(await p.hidden('#setup-coach'), true, 'the same three ratings do not suggest the step again');

      await p.click('#nav-history'); await p.sleep(300);
      var stats = await p.evaluate('[...document.querySelectorAll(".stat")].map(function(n){return n.textContent}).join("|")');
      assert.strictEqual(stats, '4sessions|1:10:10trained|38:45on hold|1day streak');
      assert.strictEqual(await p.count('.tag-easy'), 3);
      assert.ok((await p.text('#hist-presets')).indexOf('CO2 table4 sessions, longest hold 1:30') > -1, await p.text('#hist-presets'));
      await p.click('#nav-setup'); await p.sleep(100);
      await p.mode('O2 table'); await p.sleep(100);
      await p.click('#btn-share'); await p.sleep(100);
      await p.click('#nav-history'); await p.sleep(200);
      assert.strictEqual(await p.evaluate('getComputedStyle(document.querySelector("#hist-list .hist-name")).fontWeight'), '600');
      assert.strictEqual(await p.evaluate('getComputedStyle(document.querySelector("#hist-list .hist-detail")).fontWeight'), '400', 'rows do not inherit the nav link style');
      await p.evaluate('document.querySelector("#hist-list .hist-row").click()'); await p.sleep(200);
      assert.strictEqual(await p.hidden('#view-setup'), false, 'a history row opens its preset');
      assert.strictEqual(await p.text('.mode.active'), 'CO2 table');
      assert.strictEqual(await p.hidden('#share-row'), true, 'switching preset closes the share row');
      await p.click('#nav-history'); await p.sleep(200);
      assert.strictEqual(await p.hidden('#btn-export-csv'), false);
      await p.evaluate('HTMLAnchorElement.prototype.click = function () { window.__dl = [this.download, this.href]; }');
      await p.click('#btn-export-csv'); await p.sleep(100);
      var dl = JSON.parse(await p.evaluate('JSON.stringify(window.__dl)'));
      assert.ok(/^breath-trainer-history-\d{4}-\d{2}-\d{2}\.csv$/.test(dl[0]), dl[0]);
      assert.ok(dl[1].indexOf('blob:') === 0, 'download is a blob URL');
      var csv = await p.evaluate('SessionLog.csv(State.data.history)');
      assert.strictEqual(csv.split('\n').length, 6, 'header, four rows, trailing newline');
      await p.click('#btn-clear-history'); await p.click('#btn-clear-history'); await p.sleep(200);
      assert.strictEqual(await p.hidden('#btn-export-csv'), true);
      assert.strictEqual(await p.text('#hist-list'), 'No sessions yet.');
      assert.strictEqual(await p.hidden('#btn-clear-history'), true);
    }
  },
  {
    name: 'share links: export, import through the hash, bad links ignored',
    run: async function (p) {
      await p.open();
      await p.set('#f-rounds', '6'); await p.sleep(200);
      await p.click('#btn-share'); await p.sleep(100);
      var url = await p.value('#share-url');
      assert.ok(/#p=[A-Za-z0-9_-]+$/.test(url), url);

      await p.open('', url.slice(url.indexOf('#')));
      assert.strictEqual(await p.evaluate('location.hash'), '');
      assert.strictEqual(await p.count('.mode'), 10);
      assert.strictEqual(await p.text('.mode.active'), 'CO2 table');
      assert.strictEqual(await p.value('#f-rounds'), '6');
      assert.strictEqual(await p.hidden('#setup-info'), false);

      await p.mode('Box 4-4-4-4'); await p.sleep(100);
      assert.strictEqual(await p.hidden('#setup-info'), true);
      await p.evaluate('location.hash = "#p=zzz"'); await p.sleep(300);
      assert.strictEqual(await p.count('.mode'), 10, 'garbage link adds nothing');
      assert.strictEqual(await p.evaluate('location.hash'), '');
      await p.evaluate('location.hash = ' + JSON.stringify(url.slice(url.indexOf('#')))); await p.sleep(300);
      assert.strictEqual(await p.count('.mode'), 11, 'hashchange imports too');

      // A link opened during a session waits until the setup view comes back
      await p.click('#btn-start'); await p.sleep(400);
      await p.evaluate('location.hash = ' + JSON.stringify(url.slice(url.indexOf('#')))); await p.sleep(300);
      assert.strictEqual(await p.hidden('#view-session'), false, 'the session keeps running');
      assert.strictEqual(await p.count('.mode'), 11);
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(300);
      assert.strictEqual(await p.count('.mode'), 12, 'imported once the session ended');
      assert.strictEqual(await p.evaluate('location.hash'), '');

      // A full session travels with its parts
      await p.mode('Full session'); await p.sleep(200);
      assert.strictEqual(await p.hidden('#btn-share'), false);
      await p.click('#btn-share'); await p.sleep(100);
      var chainUrl = await p.value('#share-url');
      await p.open('', chainUrl.slice(chainUrl.indexOf('#')));
      assert.strictEqual(await p.count('.mode'), 12, 'two parts and the session were added');
      assert.strictEqual(await p.text('.mode.active'), 'Full session');
      assert.ok((await p.text('#setup-info')).indexOf('and its 2 parts') > -1, await p.text('#setup-info'));
      var items = JSON.parse(await p.evaluate('JSON.stringify(State.cfg().items)'));
      assert.strictEqual(items.length, 2);
      assert.ok(items[0] !== items[1] && items.every(function (id) { return id.indexOf('user-') === 0; }), 'parts got distinct user ids: ' + items);
      assert.ok((await p.text('#preview')).indexOf('Total time 26:15') > -1, await p.text('#preview'));
    }
  },
  {
    name: 'settings: tone sets, backup import, reset all really wipes',
    run: async function (p) {
      await p.open();
      assert.strictEqual(await p.hidden('#tip'), false, 'first run shows the tip');
      await p.click('#btn-tip-guide'); await p.sleep(300);
      assert.strictEqual(await p.hidden('#view-settings'), false);
      assert.strictEqual(await p.count('#cue-guide .guide-row'), 10);
      await p.evaluate('document.querySelectorAll("#cue-guide .btn")[2].click()'); await p.sleep(300);
      assert.strictEqual(await p.evaluate('document.getElementById("audio").paused'), false, 'a guide cue plays');
      await p.sleep(2200);
      await p.click('#nav-setup'); await p.sleep(100);
      await p.click('#btn-tip-ok'); await p.sleep(100);
      assert.strictEqual(await p.hidden('#tip'), true);
      await p.evaluate('location.reload()'); await p.sleep(900);
      assert.strictEqual(await p.hidden('#tip'), true, 'the tip stays dismissed');
      await p.click('#nav-settings'); await p.sleep(200);
      assert.strictEqual(await p.evaluate('[...document.querySelectorAll("#set-tones option")].map(function(o){return o.value}).join()'), 'classic,soft,wood');
      await p.set('#set-tones', 'wood');
      await p.click('#btn-test-tone'); await p.sleep(400);
      assert.strictEqual(await p.evaluate('document.getElementById("audio").paused'), false);
      await p.sleep(3500);

      var ok = await p.evaluate('(function(){ var o = JSON.parse(State.exportText()); o.settings.volume = 0.35; o.configs.co2.rounds = 5; o.history = [{ at: Date.now() - 86400000, id: "co2", name: "CO2 table", kind: "table", rounds: 8, roundsTotal: 8, total: 1270, hold: 720, longest: 90, completed: true }]; return State.importData(o); })()');
      assert.strictEqual(ok, true);
      assert.strictEqual(await p.evaluate('State.importData({ nope: 1 })'), false);
      await p.go(p.base + '/index.html');
      assert.strictEqual(await p.evaluate('State.settings.volume'), 0.35);
      assert.strictEqual(await p.evaluate('State.data.configs.co2.rounds'), 5);
      assert.strictEqual(await p.evaluate('State.data.history.length'), 1);

      await p.click('#nav-settings'); await p.sleep(100);
      await p.set('#set-theme', 'light');
      await p.click('#btn-reset-all'); await p.click('#btn-reset-all'); await p.sleep(1200);
      assert.strictEqual(await p.evaluate('localStorage.getItem("breathtrainer.v1")'), null);
      assert.strictEqual(await p.evaluate('document.documentElement.getAttribute("data-theme")'), null);
      assert.strictEqual(await p.evaluate('State.data.configs.co2.rounds'), 8);
    }
  },
  {
    name: 'hold ticks: legacy boolean migrates to an interval',
    run: async function (p) {
      await p.open(seed({ version: 1, settings: { holdTicks: true }, configs: {}, userPresetIds: [], history: [] }));
      assert.strictEqual(await p.evaluate('State.settings.holdTicks'), 30);
      await p.click('#nav-settings'); await p.sleep(100);
      assert.strictEqual(await p.value('#set-holdticks'), '30');
      await p.set('#set-holdticks', '15');
      assert.strictEqual(await p.evaluate('State.settings.holdTicks'), 15);
    }
  },
  {
    name: 'max static attempt: count-up hold, urge, guarded skip, single-tap stop, limit',
    run: async function (p) {
      await p.open();
      await p.mode('Max static attempt'); await p.sleep(200);
      assert.strictEqual(await p.evaluate('[...document.querySelectorAll("#config-form label")].map(function(l){return l.textContent}).join()'), 'Get ready,Breathe-up,Hold limit');
      await p.click('#btn-start'); await p.sleep(400);
      assert.strictEqual(await p.text('#s-round'), 'Max attempt');
      await p.click('#btn-skip'); await p.click('#btn-skip'); await p.sleep(1600);
      assert.strictEqual(await p.text('#s-phase'), 'Hold');
      assert.strictEqual(await p.text('#s-time'), '0:01');
      assert.strictEqual(await p.hidden('#btn-skip'), true);
      assert.strictEqual(await p.hidden('#btn-urge'), false);
      assert.strictEqual(await p.text('#s-remaining'), 'Limit 10:00');
      await p.evaluate('document.getElementById("audio").currentTime = 130.2'); await p.sleep(200);
      await p.click('#btn-stop'); await p.sleep(100);
      assert.strictEqual(await p.text('#btn-stop'), 'Confirm stop', 'a Stop in the first seconds of the hold is a normal stop');
      await p.click('#btn-stop'); await p.sleep(300);
      assert.strictEqual(await p.hidden('#view-setup'), false);
      assert.strictEqual(await p.evaluate('State.data.history.length'), 0, 'nothing logged, no fake static');
      assert.strictEqual(await p.evaluate('State.settings.maxStatic'), 0);
      await p.click('#btn-start'); await p.sleep(400);
      await p.click('#btn-skip'); await p.click('#btn-skip'); await p.sleep(3200);

      await p.key('ArrowRight');
      assert.strictEqual(await p.text('#s-phase'), 'Hold', 'skip cannot end an attempt hold');
      await p.key('u');
      assert.ok((await p.text('#s-note')).indexOf('Urge at') === 0, 'U key marks the urge');
      assert.strictEqual(await p.evaluate('document.getElementById("btn-urge").disabled'), true);
      await p.sleep(1200);

      await p.key('Escape');
      assert.strictEqual(await p.hidden('#view-done'), false, 'one tap (or Escape) ends an attempt hold');
      assert.strictEqual(await p.text('#btn-stop'), 'Stop');
      var summary = await p.text('#done-summary');
      assert.ok(/Hold0:0[3-7]/.test(summary), summary);
      assert.ok(summary.indexOf('First urge') > -1, summary);
      assert.ok(summary.indexOf('New max static') > -1, summary);
      assert.ok(await p.evaluate('State.settings.maxStatic') >= 2);
      var e = JSON.parse(await p.evaluate('JSON.stringify(State.data.history[0])'));
      assert.strictEqual(e.attempt, true);
      assert.strictEqual(e.completed, true);
      assert.ok(e.urge >= 1);
      await p.click('#btn-back'); await p.sleep(200);
      assert.ok((await p.text('#preview')).indexOf('Current max static') > -1);

      await p.click('#btn-start'); await p.sleep(400);
      await p.click('#btn-skip'); await p.click('#btn-skip'); await p.sleep(200);
      await p.evaluate('document.getElementById("audio").currentTime = 729.6'); await p.sleep(700);
      assert.strictEqual(await p.hidden('#view-done'), false);
      assert.strictEqual(await p.evaluate('document.getElementById("audio").paused'), false, 'chime plays at the limit');
      assert.ok((await p.text('#done-summary')).indexOf('Hold10:00') > -1);
      await p.sleep(2500);
      assert.strictEqual(await p.evaluate('document.getElementById("audio").readyState'), 0);
      await p.click('#btn-back'); await p.sleep(200);

      await p.mode('CO2 table'); await p.sleep(200);
      assert.strictEqual(await p.value('.suggest input'), '10:00', 'attempt result feeds the suggestion box');
    }
  },
  {
    name: 'chain: parts editor, preview, session shows the current part',
    run: async function (p) {
      await p.open();
      await p.mode('Full session'); await p.sleep(200);
      assert.strictEqual(await p.count('.part-row'), 2);
      assert.strictEqual(await p.evaluate('[...document.querySelectorAll(".part-row select:not(.part-no)")].map(function(s){return s.value}).join()'), 'coherent,co2');
      assert.ok((await p.evaluate('[...document.querySelectorAll(".part-row option")].map(function(o){return o.value})')).indexOf('maxstatic') > -1, 'attempts can be a part');
      var preview = await p.text('#preview');
      assert.ok(preview.indexOf('Coherent 5-5, 5:05') > -1 && preview.indexOf('CO2 table, 21:10') > -1 && preview.indexOf('Total time 26:15') > -1, preview);
      await p.evaluate('document.querySelectorAll("#preview li")[1].click()'); await p.sleep(900);
      assert.strictEqual(await p.text('#s-mode'), 'CO2 table (2 of 2)', 'tapping a part starts there');
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(300);
      assert.strictEqual(await p.evaluate('State.data.history.length'), 0, 'nothing done, nothing logged');
      await p.evaluate('[...document.querySelectorAll("#config-form .btn")].find(function(b){return b.textContent==="Add part"}).click()'); await p.sleep(200);
      assert.strictEqual(await p.count('.part-row'), 3);
      await p.evaluate('var s = document.querySelectorAll(".part-row .part-no")[0]; s.value = "2"; s.dispatchEvent(new Event("change"))'); await p.sleep(200);
      assert.strictEqual(await p.evaluate('[...document.querySelectorAll(".part-row select:not(.part-no)")].map(function(s){return s.value}).join()'), 'co2,co2,coherent', 'a part moves forward');
      await p.evaluate('var s = document.querySelectorAll(".part-row .part-no")[2]; s.value = "0"; s.dispatchEvent(new Event("change"))'); await p.sleep(200);
      await p.evaluate('document.querySelectorAll(".part-row .remove")[2].click()'); await p.sleep(200);
      assert.strictEqual(await p.count('.part-row'), 2);
      await p.evaluate('var s = document.querySelectorAll(".part-row .part-no")[1]; s.value = "0"; s.dispatchEvent(new Event("change"))'); await p.sleep(200);
      assert.strictEqual(await p.evaluate('[...document.querySelectorAll(".part-row select:not(.part-no)")].map(function(s){return s.value}).join()'), 'co2,coherent', 'the position select moves a part');
      await p.evaluate('var s = document.querySelectorAll(".part-row .part-no")[1]; s.value = "0"; s.dispatchEvent(new Event("change"))'); await p.sleep(200);
      assert.strictEqual(await p.evaluate('[...document.querySelectorAll(".part-row select:not(.part-no)")].map(function(s){return s.value}).join()'), 'coherent,co2');

      await p.click('#btn-start'); await p.sleep(500);
      assert.strictEqual(await p.text('#s-mode'), 'Coherent 5-5 (1 of 2)');
      assert.strictEqual(await p.text('#s-round'), '30 cycles');
      await p.evaluate('document.getElementById("audio").currentTime = 304'); await p.sleep(400);
      assert.strictEqual(await p.text('#s-phase'), 'Exhale');
      assert.ok((await p.text('#s-next')).indexOf('Next: CO2 table, Get ready 0:10') === 0, await p.text('#s-next'));
      await p.evaluate('document.getElementById("audio").currentTime = 316'); await p.sleep(400);
      assert.strictEqual(await p.text('#s-mode'), 'CO2 table (2 of 2)');
      assert.strictEqual(await p.text('#s-phase'), 'Breathe');
      assert.strictEqual(await p.text('#s-round'), 'Round 1 of 8');
      assert.ok(/^(2:00|1:59)$/.test(await p.text('#s-time')), 'table part counts in mm:ss');
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(300);
      var e = JSON.parse(await p.evaluate('JSON.stringify(State.data.history[0])'));
      assert.strictEqual(e.kind, 'chain');
      assert.strictEqual(e.rounds, 30);
      assert.strictEqual(e.roundsTotal, 38);

      // A short chain with pips: finished rounds stay lit through the next part's Get ready
      await p.evaluate('State.data.configs.chain.items = ["box", "co2"]; State.data.configs.box.minutes = 1; State.persist();');
      await p.mode('Full session'); await p.sleep(200);
      assert.ok((await p.text('#preview')).indexOf('Total time 22:19') > -1, await p.text('#preview'));   // box: 4 cycles of 16 s + 5 s prep
      await p.click('#btn-start'); await p.sleep(400);
      await p.evaluate('document.getElementById("audio").currentTime = 72'); await p.sleep(400);
      assert.strictEqual(await p.text('#s-round'), '8 rounds');
      assert.strictEqual(await p.evaluate('[...document.querySelectorAll("#s-pips .pip")].filter(function(x){return x.className.indexOf("past")>-1}).length'), 4, 'four box cycles stay lit during the CO2 prep');
      assert.strictEqual(await p.evaluate('navigator.mediaSession.metadata.title'), 'CO2 table');
      await p.evaluate('document.getElementById("audio").currentTime = 1338.8'); await p.sleep(800);
      assert.strictEqual(await p.hidden('#view-done'), false, 'a chain finishes on the Done view');
      var done = await p.text('#done-summary');
      assert.ok(done.indexOf('Rounds12') > -1 && done.indexOf('Time on hold12:00') > -1, done);
      assert.strictEqual(await p.evaluate('State.data.history[0].completed'), true);
      await p.click('#btn-back'); await p.sleep(200);

      // Warm-up holds then a max attempt: the last part's hold counts up and its own length is the result
      await p.evaluate('State.data.configs.chain.items = ["co2", "maxstatic"]; State.data.configs.co2.rounds = 1; State.data.configs.co2.holdStart = 120; State.persist();');
      await p.mode('Full session'); await p.sleep(200);
      assert.ok((await p.text('#preview')).indexOf('Max static attempt, 12:10') > -1, await p.text('#preview'));
      await p.click('#btn-start'); await p.sleep(400);
      await p.evaluate('document.getElementById("audio").currentTime = 131'); await p.sleep(400);
      assert.strictEqual(await p.text('#s-phase'), 'Hold');
      assert.strictEqual(await p.hidden('#btn-urge'), true, 'a warm-up hold is a normal hold');
      assert.strictEqual(await p.text('#s-round'), 'Round 1 of 1');
      assert.strictEqual(await p.text('#s-time'), '1:59');
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(300);
      var early = JSON.parse(await p.evaluate('JSON.stringify(State.data.history[0])'));
      assert.strictEqual(early.attempt, false, 'stopping in the warm-up is not a static attempt');
      await p.click('#btn-start'); await p.sleep(400);
      await p.evaluate('document.getElementById("audio").currentTime = 250 + 130'); await p.sleep(3400);
      assert.strictEqual(await p.text('#s-mode'), 'Max static attempt (2 of 2)');
      assert.strictEqual(await p.text('#s-round'), 'Max attempt');
      assert.strictEqual(await p.hidden('#btn-urge'), false);
      assert.strictEqual(await p.hidden('#btn-prev'), true);
      assert.strictEqual(await p.text('#s-time'), '0:03');
      await p.key('ArrowLeft');
      assert.strictEqual(await p.text('#s-phase'), 'Hold', 'Back cannot rewind the attempt hold');
      await p.click('#btn-stop'); await p.sleep(300);
      assert.strictEqual(await p.hidden('#view-done'), false);
      var att = JSON.parse(await p.evaluate('JSON.stringify(State.data.history[0])'));
      assert.ok(att.longest >= 3 && att.longest <= 5, 'the result is the attempt hold, not the 2:00 warm-up: ' + att.longest);
      assert.strictEqual(att.completed, true);
      assert.strictEqual(att.rounds, 2);
      await p.click('#btn-back'); await p.sleep(200);
      await p.evaluate('document.querySelectorAll("#preview li")[1].click()'); await p.sleep(900);
      await p.evaluate('document.getElementById("audio").currentTime = 250 + 130'); await p.sleep(3400);
      await p.click('#btn-stop'); await p.sleep(300);
      assert.strictEqual(await p.evaluate('State.data.history[0].rounds'), 1, 'started at the attempt: only its round counts');
      await p.click('#btn-back'); await p.sleep(200);
      await p.evaluate('State.data.configs.co2.rounds = 8; State.data.configs.co2.holdStart = 90; State.persist();');

      // Deleting a preset drops it from chains
      await p.mode('CO2 table'); await p.sleep(100);
      await p.click('#btn-save-preset'); await p.evaluate('document.getElementById("preset-name").value = "Temp"'); await p.click('#btn-save-confirm'); await p.sleep(200);
      var tempId = await p.evaluate('State.current()');
      await p.evaluate('State.data.configs.chain.items = ["coherent", ' + JSON.stringify(tempId) + ']; State.persist();');
      await p.click('#btn-delete-preset'); await p.click('#btn-delete-preset'); await p.sleep(200);
      assert.deepStrictEqual(JSON.parse(await p.evaluate('JSON.stringify(State.data.configs.chain.items)')), ['coherent']);
    }
  },
  {
    name: 'patterns: phase editor, kinds, suggestion box, keyboard shortcuts, theme',
    run: async function (p) {
      await p.open();
      await p.mode('Custom pattern'); await p.sleep(200);
      assert.strictEqual(await p.count('.phase-row'), 2);
      await p.evaluate('[...document.querySelectorAll("#config-form .btn")].find(function(b){return b.textContent==="Add phase"}).click()'); await p.sleep(200);
      assert.strictEqual(await p.count('.phase-row'), 3);
      await p.evaluate('var s = document.querySelectorAll(".phase-row select")[2]; s.value = "Hold"; s.dispatchEvent(new Event("change"))'); await p.sleep(200);
      await p.evaluate('var i = document.querySelectorAll(".phase-row input")[2]; i.value = "12"; i.dispatchEvent(new Event("change"))'); await p.sleep(200);
      assert.ok((await p.text('#preview')).indexOf('Hold 12 s') > -1);
      assert.ok((await p.text('#preview')).indexOf('cycles of 22 s') > -1, await p.text('#preview'));
      var kinds = JSON.parse(await p.evaluate('JSON.stringify(Schedule.build(State.cfg()).segments.slice(1, 4).map(function(s){return s.kind}))'));
      assert.deepStrictEqual(kinds, ['inhale', 'exhale', 'hold-out'], 'a hold after an exhale is a hold-out');
      await p.evaluate('document.querySelectorAll(".phase-row .remove")[0].click()'); await p.sleep(200);
      assert.strictEqual(await p.count('.phase-row'), 2);
      await p.evaluate('location.reload()'); await p.sleep(900);
      assert.strictEqual(await p.count('.phase-row'), 2, 'phase edits persist');

      await p.click('#btn-start'); await p.sleep(400);
      await p.key('ArrowRight');
      assert.strictEqual(await p.text('#s-phase'), 'Exhale');
      await p.evaluate('document.getElementById("btn-pause").focus()');
      await p.key(' ');
      assert.strictEqual(await p.text('#btn-pause'), 'Resume', 'space pauses exactly once even with the Pause button focused');
      await p.key(' ');
      assert.strictEqual(await p.text('#btn-pause'), 'Pause');
      await p.key('ArrowLeft');
      assert.strictEqual(await p.text('#s-phase'), 'Get ready', 'Back within 2 s of a segment start goes to the previous one');
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(200);

      await p.mode('O2 table'); await p.sleep(200);
      await p.evaluate('var i = document.querySelector(".suggest input"); i.value = "4:00"; document.querySelector(".suggest .btn").click()'); await p.sleep(300);
      assert.strictEqual(await p.value('#f-holdStart'), '1:35', 'O2 start is 40 percent of max');
      assert.strictEqual(await p.evaluate('State.settings.maxStatic'), 240);
      await p.evaluate('var i = document.querySelector(".suggest input"); i.value = "0:10"; document.querySelector(".suggest .btn").click()'); await p.sleep(200);
      assert.strictEqual(await p.value('#f-holdStart'), '1:35', 'values under 30 s are refused');

      await p.click('#nav-settings'); await p.sleep(100);
      await p.set('#set-theme', 'light');
      assert.strictEqual(await p.evaluate('document.documentElement.getAttribute("data-theme")'), 'light');
      assert.strictEqual(await p.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(242, 245, 247)');
      assert.strictEqual(await p.evaluate('document.querySelector("meta[name=theme-color]").content'), '#f2f5f7', 'browser chrome follows the theme');
      await p.set('#set-theme', 'dark');
      assert.strictEqual(await p.evaluate('document.querySelector("meta[name=theme-color]").content'), '#0e1418');
      await p.set('#set-theme', 'system');
      await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }); await p.sleep(200);
      assert.strictEqual(await p.evaluate('document.querySelector("meta[name=theme-color]").content'), '#f2f5f7', 'system theme flips to light');
      await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }); await p.sleep(200);
      assert.strictEqual(await p.evaluate('document.querySelector("meta[name=theme-color]").content'), '#0e1418', 'and back to dark');
      await p.set('#set-theme', 'light');
      await p.set('#set-countdown', '');
      await p.evaluate('var c = document.getElementById("set-countdown"); c.checked = false; c.dispatchEvent(new Event("change"))');
      await p.evaluate('location.reload()'); await p.sleep(900);
      assert.strictEqual(await p.evaluate('document.documentElement.getAttribute("data-theme")'), 'light');
      await p.click('#nav-settings'); await p.sleep(100);
      assert.strictEqual(await p.evaluate('document.getElementById("set-countdown").checked'), false, 'toggle persisted');
      await p.click('#nav-setup'); await p.sleep(100);
      await p.click('#btn-start'); await p.sleep(300);
      var cues = await p.evaluate('Schedule.cues(Schedule.build(State.cfg(), State.config), State.settings).filter(function(c){return c.tone==="tick"}).length');
      assert.strictEqual(cues, 0, 'countdown ticks off');
      await p.shot('light-session');
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(200);
    }
  },
  {
    name: 'layout: landscape session keeps controls on screen, desktop uses two columns',
    run: async function (p) {
      await p.open();
      await p.viewport(844, 390);
      await p.click('#btn-start'); await p.sleep(500);
      var bottom = await p.evaluate('document.querySelector(".session-bottom").getBoundingClientRect().bottom');
      assert.ok(bottom <= 390, 'buttons within the viewport: ' + bottom);
      assert.strictEqual(await p.evaluate('getComputedStyle(document.getElementById("s-note")).display'), 'block', 'the note stays visible in landscape');
      assert.ok(await p.evaluate('getComputedStyle(document.querySelector(".dial")).width') !== '360px');
      await p.shot('landscape-session');
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(200);

      await p.viewport(1280, 800);
      var cols = await p.evaluate('getComputedStyle(document.getElementById("view-setup")).gridTemplateColumns.split(" ").length');
      assert.strictEqual(cols, 2);
      assert.strictEqual(await p.hidden('#tip'), false);
      var tipW = await p.evaluate('document.getElementById("tip").getBoundingClientRect().width');
      var viewW = await p.evaluate('document.getElementById("view-setup").getBoundingClientRect().width');
      assert.ok(Math.abs(tipW - viewW) < 2, 'the tip spans both columns: ' + tipW + ' vs ' + viewW);
      await p.shot('desktop-setup');
      await p.viewport(390, 844);
    }
  },
  {
    name: 'offline: the service worker precaches the shell and the app starts with the server gone',
    https: true,
    run: async function (p) {
      await p.go(p.secure.base + '/index.html');
      var state = await p.evaluate('navigator.serviceWorker.ready.then(function (r) { return r.active && r.active.state; })');
      assert.strictEqual(state, 'activated');
      await p.sleep(800);
      var keys = await p.evaluate('caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.open(k).then(function (c) { return c.keys(); }); })); }).then(function (all) { return all.flat().map(function (r) { return r.url.split("/").slice(3).join("/"); }); })');
      var scripts = await p.evaluate('Array.from(document.scripts).map(function (s) { return s.src.split("/").slice(3).join("/"); })');
      scripts.forEach(function (src) { assert.ok(keys.indexOf(src) > -1, 'precached ' + src); });
      assert.ok(keys.indexOf('index.html') > -1);
      p.secure.stop();
      await p.sleep(300);
      await p.go(p.secure.base + '/index.html');
      assert.strictEqual(await p.evaluate('typeof Schedule'), 'object', 'scripts came from the cache');
      assert.strictEqual(await p.count('.mode'), 9);
      assert.strictEqual(await p.evaluate('navigator.serviceWorker.controller !== null'), true);
      await p.click('#btn-start'); await p.sleep(1200);
      assert.strictEqual(await p.evaluate('document.getElementById("audio").paused'), false, 'a session plays offline');
      assert.ok(await p.evaluate('document.getElementById("audio").currentTime') > 0.5);
      await p.click('#btn-stop'); await p.click('#btn-stop'); await p.sleep(200);
    }
  },
  {
    name: 'update on a slow network: the old worker waits for assets it has not cached',
    https: true,
    run: async function (p) {
      var srv = await p.startSecure();
      await p.go(srv.base + '/index.html');
      await p.evaluate('navigator.serviceWorker.ready');
      await p.sleep(800);
      srv.knobs.bump = true;      // a new build was deployed
      srv.knobs.delay = 4000;     // and the network is slow
      await p.send('Page.navigate', { url: srv.base + '/index.html' });
      await p.sleep(11000);
      assert.strictEqual(await p.evaluate('typeof Schedule'), 'object', 'new scripts arrived through the old worker');
      assert.strictEqual(await p.count('.mode'), 9);
      srv.knobs.delay = 0;
      srv.stop();
    }
  }
];
