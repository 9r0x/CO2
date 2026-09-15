/* Done view: the summary of the session just finished, its rating and a shareable line. */
var DoneView = (function () {
  'use strict';

  var $ = UI.$;
  var el = UI.el;
  var doneAt = 0;          // log time of the session shown


  /* e is the log entry of the session just finished (e.at identifies it for the rating). */
  function show(sch, e, attemptNote) {
    doneAt = e.at;
    var dl = $('done-summary');
    dl.innerHTML = '';
    var rows = [['Preset', e.name]];
    if (sch.attempt) {
      rows.push(['Hold', Schedule.fmt(e.longest)]);
      if (e.urge && e.longest) { rows.push(['First urge', Schedule.fmt(e.urge) + ' (' + Math.min(100, Math.round(100 * e.urge / e.longest)) + ' percent)']); }
      rows.push(['Result', attemptNote]);
    } else {
      rows.push([sch.kind === 'pattern' ? 'Cycles' : 'Rounds', e.rounds >= e.roundsTotal ? String(e.roundsTotal) : e.rounds + ' of ' + e.roundsTotal]);
      rows.push(['Total time', Schedule.fmt(e.total)]);
      if (e.hold) {
        rows.push(['Time on hold', Schedule.fmt(e.hold)]);
        rows.push(['Longest hold', Schedule.fmt(e.longest)]);
      }
    }
    var week = SessionLog.totals(State.data.history, Date.now() - 7 * SessionLog.DAY);
    rows.push(['This week', week.sessions + (week.sessions === 1 ? ' session, ' : ' sessions, ') + Schedule.fmt(week.total)]);
    rows.forEach(function (pair) {
      dl.appendChild(el('dt', null, pair[0]));
      dl.appendChild(el('dd', null, pair[1]));
    });
    markRating('');
    $('btn-share-result').textContent = 'share' in navigator ? 'Share' : 'Copy summary';
    UI.showView('done');
  }

  function markRating(rating) {
    Array.prototype.forEach.call($('done-rate').querySelectorAll('button'), function (b) {
      b.classList.toggle('primary', b.dataset.rating === rating);
      b.setAttribute('aria-pressed', b.dataset.rating === rating ? 'true' : 'false');
    });
  }

  function rateDone(e) {
    var rating = e.target.dataset.rating;
    State.rateSession(doneAt, rating);
    markRating(rating);
  }

  /* Share sheet where there is one, otherwise the summary goes to the clipboard. */
  function shareResult() {
    var entry = State.data.history.filter(function (x) { return x.at === doneAt; })[0];
    var text = SessionLog.summary(entry, Schedule.fmt) + ' (Breath Trainer)';
    var btn = $('btn-share-result');
    if ('share' in navigator) { navigator.share({ text: text }).catch(function () {}); return; }
    UI.copyText(text).then(function (ok) { if (ok) { btn.textContent = 'Copied'; } });
  }

  function bind() {
    $('btn-again').addEventListener('click', function () { SessionView.start(State.cfg()); });
    $('btn-back').addEventListener('click', function () { SetupView.refresh(); UI.showView('setup'); });
    $('btn-share-result').addEventListener('click', shareResult);
    Array.prototype.forEach.call($('done-rate').querySelectorAll('button'), function (b) { b.addEventListener('click', rateDone); });
  }

  return { show: show, bind: bind };
})();
