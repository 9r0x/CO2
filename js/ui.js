/* Small DOM helpers, view switching, theme and formatting shared by the views. */
var UI = (function () {
  'use strict';

  var VIEWS = ['setup', 'session', 'done', 'history', 'settings'];

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text != null) { node.textContent = text; }
    return node;
  }

  /* Sets text only when it changed; returns whether it did. */
  function setText(id, text) {
    var node = $(id);
    if (node.textContent === text) { return false; }
    node.textContent = text;
    return true;
  }

  function showView(name) {
    VIEWS.forEach(function (v) { $('view-' + v).hidden = (v !== name); });
    document.body.classList.toggle('in-session', name === 'session');
    ['setup', 'history', 'settings'].forEach(function (v) {
      $('nav-' + v).classList.toggle('active', name === v);
      $('nav-' + v).setAttribute('aria-current', name === v ? 'page' : 'false');
    });
    window.scrollTo(0, 0);
    $('view-' + name).focus({ preventScroll: true });
  }

  function applyTheme(theme) {
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    // The browser chrome follows the page background (app.js re-runs this when the OS theme flips).
    var light = theme === 'light' || (theme !== 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', light ? '#f2f5f7' : '#0e1418');
  }

  /* Restarts a CSS animation by toggling its class. */
  function replay(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
  }

  function clock(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatValue(kind, v) {
    if (kind === 'time') { return Schedule.fmt(v); }
    if (kind === 'signed') { return (v > 0 ? '+' : '') + v + ' s'; }
    if (kind === 'minutes') { return v + ' min'; }
    if (kind === 'seconds') { return v + ' s'; }
    return String(v);
  }

  function parseValue(kind, text) {
    if (kind === 'time') { return Schedule.parse(text); }
    var n = parseInt(String(text).replace(/[^-\d]/g, ''), 10);
    return isNaN(n) ? NaN : n;
  }

  /* Two-tap confirmation: the first tap changes the label, the second within 3 s runs the action. */
  function armed(btn, armedLabel, action) {
    var label = btn.textContent;
    var timer = 0;
    btn.addEventListener('click', function () {
      if (btn.dataset.armed === '1') {
        clearTimeout(timer);
        btn.dataset.armed = '0';
        btn.textContent = label;
        action();
        return;
      }
      btn.dataset.armed = '1';
      btn.textContent = armedLabel;
      clearTimeout(timer);
      timer = setTimeout(function () { btn.dataset.armed = '0'; btn.textContent = label; }, 3000);
    });
    return function disarm() {
      clearTimeout(timer);
      btn.dataset.armed = '0';
      btn.textContent = label;
    };
  }

  /* Runs fn on tap, and again every 90 ms while the button stays pressed for longer than 400 ms. */
  function holdRepeat(btn, fn) {
    var timer = 0;
    var interval = 0;
    var repeated = false;   // the click that ends a long press must not step again
    function stop() { clearTimeout(timer); clearInterval(interval); timer = 0; interval = 0; }
    btn.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) { return; }
      stop();
      repeated = false;
      timer = setTimeout(function () { repeated = true; interval = setInterval(fn, 90); }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (name) { btn.addEventListener(name, stop); });
    btn.addEventListener('click', function () { if (!repeated) { fn(); } repeated = false; });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* Copies text; resolves to true when it worked. Falls back to execCommand where the clipboard API is missing (plain http). */
  function copyText(text) {
    if (navigator.clipboard) { return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; }); }
    var box = el('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    var ok = document.execCommand('copy');
    box.remove();
    return Promise.resolve(ok);
  }

  /* Offers text as a file download through a temporary link. */
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }

  /* Decorative bubbles rising behind a view; each gets random position, size and timing. */
  function makeBubbles(box, count, speed) {
    for (var i = 0; i < count; i++) {
      var b = el('span', 'bubble');
      var dur = speed * (1 + Math.random());
      b.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
      b.style.setProperty('--size', (6 + Math.random() * 14).toFixed(0) + 'px');
      b.style.setProperty('--dur', dur.toFixed(1) + 's');
      b.style.setProperty('--delay', (-Math.random() * dur * 2).toFixed(1) + 's');
      b.style.setProperty('--sway', (2 + Math.random() * 3).toFixed(1) + 's');
      box.appendChild(b);
    }
  }

  return {
    $: $,
    el: el,
    setText: setText,
    showView: showView,
    applyTheme: applyTheme,
    replay: replay,
    clock: clock,
    formatValue: formatValue,
    parseValue: parseValue,
    armed: armed,
    holdRepeat: holdRepeat,
    download: download,
    copyText: copyText,
    makeBubbles: makeBubbles
  };
})();
