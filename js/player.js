/* The single <audio> element. iOS rules: start() runs synchronously inside a tap,
 * currentTime is the master clock, the element is never muted, object URLs are
 * revoked only when replaced. */
var Player = (function () {
  'use strict';

  var audio = null;
  var source = null;
  var url = null;
  var totalDuration = 0;
  var listeners = {};
  var wakeLock = null;
  var handlers = {};

  function emit(name, ev) {
    (listeners[name] || []).forEach(function (fn) { fn(ev); });
  }

  function on(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
  }

  function init(el) {
    audio = el;
    source = el.querySelector('source') || el;
    audio.loop = false;
    audio.muted = false;
    ['playing', 'pause', 'ended', 'error', 'timeupdate'].forEach(function (name) {
      audio.addEventListener(name, function (ev) { emit(name, ev); });
    });
    // A failing <source> reports its error on the <source> element, not on <audio>.
    source.addEventListener('error', function (ev) { emit('error', ev); });
  }

  function assign(blob, seconds) {
    if (url) { URL.revokeObjectURL(url); }
    url = URL.createObjectURL(blob);
    totalDuration = seconds;
    source.src = url;
    if (source !== audio) { audio.removeAttribute('src'); }
    audio.load();
  }

  function play() {
    var p;
    try { p = audio.play(); } catch (e) { return Promise.reject(e); }
    return (p && typeof p.then === 'function') ? p : Promise.resolve();
  }

  /* 'transient' ducks and mixes with other apps' audio (Safari 17+); 'auto' is the
   * exclusive playback session that keeps the cues alive under the lock screen. */
  function setMix(on) {
    if ('audioSession' in navigator) { navigator.audioSession.type = on ? 'transient' : 'auto'; }
  }

  /* opts: { volume, mix, tones } from settings. */
  function start(cues, totalSeconds, opts) {
    var blob = Tones.makeBlob(cues, totalSeconds, opts.volume, opts.tones);
    setMix(opts.mix);
    assign(blob, totalSeconds + Tones.TAIL);
    return play();
  }

  function playTest(opts) {
    return playCues([{ t: 0, tone: 'breathe' }, { t: 0.8, tone: 'hold' }, { t: 2.0, tone: 'tick' }], 2.2, opts);
  }

  /* A single cue, for the guide in Settings. */
  function playCue(tone, opts) {
    return playCues([{ t: 0, tone: tone }], 0.5, opts);
  }

  function playCues(cues, seconds, opts) {
    var blob = Tones.makeBlob(cues, seconds, opts.volume, opts.tones);
    setMix(opts.mix);
    assign(blob, seconds + Tones.TAIL);
    return play();
  }

  function pause() { audio.pause(); }
  function resume() { return play(); }

  /* Drops the track so the system media controls cannot restart it once the session is over. */
  function unload() {
    source.removeAttribute('src');
    audio.load();
    totalDuration = 0;
  }

  function stop() {
    audio.pause();
    unload();
  }

  function seek(t) {
    var target = Math.max(0, Math.min(totalDuration, t));
    try { audio.currentTime = target; } catch (e) { /* ignore */ }
    updatePosition();
  }

  function time() { return audio ? (audio.currentTime || 0) : 0; }
  function paused() { return !audio || audio.paused; }

  function mediaSession() {
    return ('mediaSession' in navigator) ? navigator.mediaSession : null;
  }

  var artwork = null;

  /* A ring on a dark square, drawn once, so the lock screen shows something recognisable. */
  function makeArtwork() {
    var size = 512;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0e1418';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#35c4a6';
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 150, 0, 2 * Math.PI);
    ctx.stroke();
    return [{ src: canvas.toDataURL('image/png'), sizes: size + 'x' + size, type: 'image/png' }];
  }

  function setMetadata(title, subtitle) {
    var ms = mediaSession();
    if (!ms || typeof window.MediaMetadata !== 'function') { return; }
    if (!artwork) { artwork = makeArtwork(); }
    try {
      ms.metadata = new MediaMetadata({ title: title, artist: subtitle || 'Breath Trainer', album: 'Breath Trainer', artwork: artwork });
    } catch (e) { /* ignore */ }
  }

  function updatePosition() {
    var ms = mediaSession();
    if (!ms || typeof ms.setPositionState !== 'function' || !totalDuration) { return; }
    try {
      ms.setPositionState({
        duration: totalDuration,
        playbackRate: 1,
        position: Math.max(0, Math.min(totalDuration, time()))
      });
    } catch (e) { /* position past duration or unsupported */ }
  }

  function setHandlers(h) {
    handlers = h || {};
    var ms = mediaSession();
    if (!ms || typeof ms.setActionHandler !== 'function') { return; }
    var map = {
      play: function () { if (handlers.play) { handlers.play(); } else { resume(); } },
      pause: function () { if (handlers.pause) { handlers.pause(); } else { pause(); } },
      stop: function () { if (handlers.stop) { handlers.stop(); } },
      nexttrack: function () { if (handlers.next) { handlers.next(); } },
      previoustrack: function () { if (handlers.previous) { handlers.previous(); } },
      seekto: function (d) { if (d && typeof d.seekTime === 'number') { if (handlers.seekto) { handlers.seekto(d.seekTime); } else { seek(d.seekTime); } } }
    };
    Object.keys(map).forEach(function (action) {
      try { ms.setActionHandler(action, map[action]); } catch (e) { /* action unsupported */ }
    });
  }

  function clearHandlers() {
    var ms = mediaSession();
    if (!ms || typeof ms.setActionHandler !== 'function') { return; }
    ['play', 'pause', 'stop', 'nexttrack', 'previoustrack', 'seekto'].forEach(function (a) {
      try { ms.setActionHandler(a, null); } catch (e) { /* ignore */ }
    });
    ms.metadata = null;
  }

  function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) { return; }
    try {
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        lock.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      try { wakeLock.release(); } catch (e) { /* ignore */ }
      wakeLock = null;
    }
  }

  return {
    init: init,
    on: on,
    start: start,
    playTest: playTest,
    playCue: playCue,
    pause: pause,
    resume: resume,
    stop: stop,
    unload: unload,
    seek: seek,
    time: time,
    paused: paused,
    setMetadata: setMetadata,
    updatePosition: updatePosition,
    setHandlers: setHandlers,
    clearHandlers: clearHandlers,
    requestWakeLock: requestWakeLock,
    releaseWakeLock: releaseWakeLock
  };
})();
