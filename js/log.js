/* Session log: pure functions over an array of entries, newest first.
 * Entry: { at (ms), id, name, kind, rounds, roundsTotal, total (s), hold (s), completed }. */
var SessionLog = (function () {
  'use strict';

  var MAX = 300;
  var DAY = 86400000;

  /* Build an entry from a schedule and the position reached (seconds into the audio).
   * from is where the session was started (0 unless the user picked a later round). */
  function entry(schedule, config, position, now, from) {
    var t = Math.min(position, schedule.total);
    var start = from || 0;
    var completed = t >= schedule.total;
    var roundsDone = 0;
    var hold = 0;
    var longest = 0;
    var segs = schedule.segments;
    segs.forEach(function (s, i) {
      var lastOfRound = !segs[i + 1] || segs[i + 1].round !== s.round;
      if (lastOfRound && s.round && s.end <= t && s.start >= start) { roundsDone++; }
      if (s.kind === 'hold' && s.start < t && s.end > start) {
        var done = Math.min(s.end, t) - Math.max(s.start, start);
        hold += done;
        if (done > longest) { longest = done; }
      }
    });
    return {
      at: now,
      id: config.id,
      name: config.name,
      kind: schedule.kind,
      rounds: roundsDone,
      roundsTotal: schedule.rounds,
      total: Math.round(t - start),
      hold: Math.round(hold),
      longest: Math.round(longest),
      completed: completed,
      attempt: !!schedule.attempt
    };
  }

  function add(list, e) {
    return [e].concat(list).slice(0, MAX);
  }

  /* New list with the rating ('easy', 'ok' or 'hard') set on the entry logged at the given time. */
  function rate(list, at, rating) {
    return list.map(function (e) {
      return e.at === at ? Object.assign({}, e, { rating: rating }) : e;
    });
  }

  /* Ratings of the n most recent entries for one preset, newest first; unrated entries count as ''. */
  function lastRatings(list, id, n) {
    return list.filter(function (e) { return e.id === id; }).slice(0, n).map(function (e) { return e.rating || ''; });
  }

  /* The last n max static attempts, oldest first. */
  function attempts(list, n) {
    return list.filter(function (e) { return e.attempt; }).slice(0, n).reverse();
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) { s = "'" + s; }   // names come from share links; never a live formula
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* Spreadsheet export, oldest first, times in seconds. */
  function csv(list) {
    var head = ['date', 'time', 'preset', 'kind', 'completed', 'rounds', 'rounds_total', 'total_s', 'hold_s', 'longest_hold_s', 'urge_s', 'rating'];
    var lines = [head.join(',')];
    list.slice().reverse().forEach(function (e) {
      var d = new Date(e.at);
      var date = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      var time = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      lines.push([date, time, e.name, e.attempt ? 'attempt' : e.kind, e.completed ? 'yes' : 'no', e.rounds, e.roundsTotal,
        e.total, e.hold, e.longest, e.urge || '', e.rating || ''].map(csvCell).join(','));
    });
    return lines.join('\n') + '\n';
  }

  /* One line for sharing: "CO2 table: 8 rounds, 21:10, 12:00 on hold, felt easy". */
  function summary(e, fmt) {
    var parts = [];
    if (e.attempt) {
      parts.push('held ' + fmt(e.longest));
      if (e.urge) { parts.push('first urge at ' + fmt(e.urge)); }
    } else {
      parts.push((e.rounds >= e.roundsTotal ? e.roundsTotal : e.rounds + ' of ' + e.roundsTotal) + (e.kind === 'pattern' ? ' cycle' : ' round') + (e.roundsTotal === 1 ? '' : 's'));
      parts.push(fmt(e.total));
      if (e.hold) { parts.push(fmt(e.hold) + ' on hold'); }
    }
    if (e.rating) { parts.push('felt ' + e.rating); }
    return e.name + ': ' + parts.join(', ');
  }

  /* Totals per preset, most trained first: [{ id, name, sessions, total }]. */
  function byPreset(list) {
    var map = {};
    var out = [];
    list.forEach(function (e) {
      var row = map[e.id];
      if (!row) { row = map[e.id] = { id: e.id, name: e.name, sessions: 0, total: 0, longest: 0 }; out.push(row); }
      row.sessions += 1;
      row.total += e.total;
      if ((e.longest || 0) > row.longest) { row.longest = e.longest; }
    });
    return out.sort(function (a, b) { return b.total - a.total; });
  }

  /* Local midnight for a timestamp. */
  function dayStart(ms) {
    var d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* Local midnight n calendar days after (or before) a day; safe across daylight-saving changes. */
  function shiftDay(day, n) {
    var d = new Date(day);
    d.setDate(d.getDate() + n);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* Whole calendar days between two local midnights. */
  function daysBetween(from, to) {
    return Math.round((to - from) / DAY);
  }

  function sum(list, key) {
    return list.reduce(function (acc, e) { return acc + (e[key] || 0); }, 0);
  }

  /* Totals over the entries since a given time. */
  function totals(list, since) {
    var part = list.filter(function (e) { return e.at >= since; });
    return {
      sessions: part.length,
      total: sum(part, 'total'),
      hold: sum(part, 'hold'),
      longest: part.reduce(function (m, e) { return Math.max(m, e.longest || 0); }, 0)
    };
  }

  /* Seconds trained per local day for the last n days, oldest first. */
  function perDay(list, n, now) {
    var today = dayStart(now);
    var days = [];
    for (var i = n - 1; i >= 0; i--) { days.push({ day: shiftDay(today, -i), total: 0, sessions: 0 }); }
    list.forEach(function (e) {
      var idx = n - 1 - daysBetween(dayStart(e.at), today);
      if (idx >= 0 && idx < n) { days[idx].total += e.total; days[idx].sessions += 1; }
    });
    return days;
  }

  /* Consecutive days with a session, counting back from today or yesterday. */
  function streak(list, now) {
    var days = {};
    list.forEach(function (e) { days[dayStart(e.at)] = true; });
    var d = dayStart(now);
    if (!days[d]) { d = shiftDay(d, -1); }
    var count = 0;
    while (days[d]) { count++; d = shiftDay(d, -1); }
    return count;
  }

  /* Entries grouped by local day, newest first: [{ day, entries }]. */
  function groups(list) {
    var out = [];
    var last = null;
    list.forEach(function (e) {
      var d = dayStart(e.at);
      if (!last || last.day !== d) { last = { day: d, entries: [] }; out.push(last); }
      last.entries.push(e);
    });
    return out;
  }

  return {
    MAX: MAX,
    DAY: DAY,
    entry: entry,
    add: add,
    rate: rate,
    lastRatings: lastRatings,
    byPreset: byPreset,
    attempts: attempts,
    csv: csv,
    summary: summary,
    dayStart: dayStart,
    shiftDay: shiftDay,
    totals: totals,
    perDay: perDay,
    streak: streak,
    groups: groups
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = SessionLog; }
