/* History view: weekly totals, a two-week chart and the session list. */
var HistoryView = (function () {
  'use strict';

  var $ = UI.$;
  var el = UI.el;
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function dayLabel(day, now) {
    var today = SessionLog.dayStart(now);
    if (day === today) { return 'Today'; }
    if (day === SessionLog.shiftDay(today, -1)) { return 'Yesterday'; }
    return new Date(day).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function stat(box, value, label) {
    var tile = el('div', 'stat');
    tile.appendChild(el('div', 'stat-value', value));
    tile.appendChild(el('div', 'stat-label', label));
    box.appendChild(tile);
    return tile;
  }

  function shortDate(ms) {
    return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  function renderAttempts(list) {
    var rows = SessionLog.attempts(list, 8);
    $('hist-attempts-card').hidden = !rows.length;
    if (!rows.length) { return; }
    var chart = $('hist-attempts');
    chart.innerHTML = '';
    chart.style.gridTemplateColumns = 'repeat(' + rows.length + ', minmax(0, 1fr))';
    var max = rows.reduce(function (m, e) { return Math.max(m, e.longest); }, 0);
    var best = rows.reduce(function (b, e) { return e.longest > b.longest ? e : b; }, rows[0]);
    rows.forEach(function (e) {
      var col = el('div', 'chart-col has' + (e === best ? ' best' : ''));
      var bar = el('div', 'chart-bar');
      bar.style.height = Math.max(4, 100 * e.longest / max).toFixed(0) + '%';
      bar.title = Schedule.fmt(e.longest) + (e.urge ? ', urge at ' + Schedule.fmt(e.urge) : '') + ', ' + shortDate(e.at);
      if (e.urge) {
        var urge = el('div', 'chart-urge');
        urge.style.height = Math.min(100, 100 * e.urge / e.longest).toFixed(0) + '%';
        bar.appendChild(urge);
      }
      col.appendChild(bar);
      col.appendChild(el('div', 'chart-day', Schedule.fmt(e.longest)));
      chart.appendChild(col);
    });
    UI.setText('hist-best', 'Best ' + Schedule.fmt(best.longest) + ' on ' + shortDate(best.at)
      + (rows.some(function (e) { return e.urge; }) ? '. The darker part of a bar is the time before the first urge.' : '.'));
  }

  function renderStats(list, now) {
    var week = SessionLog.totals(list, now - 7 * SessionLog.DAY);
    var all = SessionLog.totals(list, 0);
    var streak = SessionLog.streak(list, now);

    var stats = $('hist-stats');
    stats.innerHTML = '';
    stat(stats, String(week.sessions), week.sessions === 1 ? 'session' : 'sessions');
    var goal = State.settings.goalMinutes * 60;
    var trained = stat(stats, Schedule.fmt(week.total), goal ? 'of ' + State.settings.goalMinutes + ' min goal' : 'trained');
    if (goal) {
      var bar = el('div', 'stat-bar');
      var fill = el('div');
      fill.style.width = Math.min(100, 100 * week.total / goal).toFixed(0) + '%';
      bar.appendChild(fill);
      trained.appendChild(bar);
    }
    stat(stats, Schedule.fmt(week.hold), 'on hold');
    stat(stats, String(streak), 'day streak');

    UI.setText('hist-alltime', all.sessions
      ? 'All time: ' + plural(all.sessions, 'session') + ', ' + Schedule.fmt(all.total) + ' trained'
        + (all.longest ? ', longest hold ' + Schedule.fmt(all.longest) : '') + '.'
      : 'Finished and stopped sessions are logged here, in this browser only.');
  }

  function renderChart(list, now) {
    var chart = $('hist-chart');
    chart.innerHTML = '';
    var days = SessionLog.perDay(list, 14, now);
    var max = days.reduce(function (m, d) { return Math.max(m, d.total); }, 0);
    days.forEach(function (d) {
      var col = el('div', 'chart-col' + (d.total ? ' has' : ''));
      var fill = el('div', 'chart-bar');
      fill.style.height = (max ? Math.max(4, (d.total / max) * 100) : 4).toFixed(0) + '%';
      fill.title = Schedule.fmt(d.total);
      col.appendChild(fill);
      col.appendChild(el('div', 'chart-day', DAY_NAMES[new Date(d.day).getDay()].charAt(0)));
      chart.appendChild(col);
    });
  }

  function renderList(list, now) {
    var box = $('hist-list');
    box.innerHTML = '';
    if (!list.length) { box.appendChild(el('p', 'muted', 'No sessions yet.')); }
    SessionLog.groups(list).forEach(function (g) {
      box.appendChild(el('h3', 'hist-day', dayLabel(g.day, now)));
      g.entries.forEach(function (e) {
        var row = el('div', 'hist-row' + (e.completed ? '' : ' partial') + (State.config(e.id) ? ' open' : ''));
        if (State.config(e.id)) {
          row.setAttribute('role', 'button');
          row.tabIndex = 0;
          row.title = 'Open ' + e.name;
          row.addEventListener('click', function () { openPreset(e.id); });
          row.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openPreset(e.id); } });
        }
        var main = el('div', 'hist-main');
        main.appendChild(el('div', 'hist-name', e.name));
        var unit = e.kind === 'pattern' ? 'cycle' : 'round';
        main.appendChild(el('div', 'hist-detail', e.attempt
          ? 'held ' + Schedule.fmt(e.longest) + (e.urge ? ', urge at ' + Schedule.fmt(e.urge) : '')
          : (e.rounds >= e.roundsTotal
            ? plural(e.roundsTotal, unit)
            : (e.completed ? '' : 'stopped after ') + e.rounds + ' of ' + plural(e.roundsTotal, unit))
            + (e.hold ? ', ' + Schedule.fmt(e.hold) + ' on hold' : '')));
        row.appendChild(main);
        if (e.rating) { main.appendChild(el('span', 'tag tag-' + e.rating, 'felt ' + e.rating)); }
        var side = el('div', 'hist-side');
        side.appendChild(el('div', 'hist-time', Schedule.fmt(e.total)));
        side.appendChild(el('div', 'hist-clock', UI.clock(e.at)));
        row.appendChild(side);
        box.appendChild(row);
      });
    });
  }

  function renderPresets(list) {
    var box = $('hist-presets');
    box.innerHTML = '';
    var rows = SessionLog.byPreset(list);
    $('hist-presets-card').hidden = !rows.length;
    rows.forEach(function (r) {
      var row = el('div', 'hist-row');
      var main = el('div', 'hist-main');
      main.appendChild(el('div', 'hist-name', r.name));
      main.appendChild(el('div', 'hist-detail', plural(r.sessions, 'session') + (r.longest ? ', longest hold ' + Schedule.fmt(r.longest) : '')));
      row.appendChild(main);
      var side = el('div', 'hist-side');
      side.appendChild(el('div', 'hist-time', Schedule.fmt(r.total)));
      row.appendChild(side);
      box.appendChild(row);
    });
  }

  function openPreset(id) {
    SetupView.select(id);
    UI.showView('setup');
  }

  function render() {
    var now = Date.now();
    var list = State.data.history;
    renderStats(list, now);
    renderChart(list, now);
    renderAttempts(list);
    renderPresets(list);
    renderList(list, now);
    $('btn-clear-history').hidden = !list.length;
    $('btn-export-csv').hidden = !list.length;
  }

  function bind() {
    $('btn-export-csv').addEventListener('click', function () {
      UI.download('breath-trainer-history-' + new Date().toISOString().slice(0, 10) + '.csv', SessionLog.csv(State.data.history), 'text/csv');
    });
    UI.armed($('btn-clear-history'), 'Tap again to clear', function () {
      State.clearLog();
      render();
    });
  }

  return { render: render, bind: bind };
})();
