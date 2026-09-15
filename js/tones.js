/* Tone definitions, PCM rendering and WAV encoding. The whole session becomes one
 * mono 16-bit WAV so a plain <audio> element can play it in the background on iOS. */
var Tones = (function () {
  'use strict';

  var SAMPLE_RATE = 8000;
  var TAIL = 1.5;     // seconds after the last cue so the end chime completes
  var PEAK = 0.85;

  /* Notes: f0/f1 start/end Hz, d seconds, gap silence before, a relative amplitude,
   * ramp attack/release seconds (default 8 ms), h2 second-harmonic amplitude,
   * decay true for a struck sound that fades out over d. */
  var SETS = {
    classic: {
      name: 'Classic beeps',
      prep:      [{ f0: 660, f1: 660, d: 0.15 }],
      breathe:   [{ f0: 660, f1: 660, d: 0.12 }, { f0: 880, f1: 880, d: 0.18, gap: 0.05 }],
      hold:      [{ f0: 440, f1: 440, d: 0.6 }],
      inhale:    [{ f0: 500, f1: 820, d: 0.35 }],
      exhale:    [{ f0: 820, f1: 500, d: 0.35 }],
      'hold-in': [{ f0: 760, f1: 760, d: 0.2 }],
      'hold-out':[{ f0: 460, f1: 460, d: 0.2 }],
      tick:      [{ f0: 1000, f1: 1000, d: 0.06 }],
      holdtick:  [{ f0: 600, f1: 600, d: 0.05, a: 0.6 }],
      done:      [{ f0: 660, f1: 660, d: 0.15 }, { f0: 830, f1: 830, d: 0.15, gap: 0.04 }, { f0: 990, f1: 990, d: 0.35, gap: 0.04 }]
    },
    soft: {
      name: 'Soft tones',
      prep:      [{ f0: 440, f1: 440, d: 0.3, ramp: 0.06 }],
      breathe:   [{ f0: 440, f1: 440, d: 0.25, ramp: 0.05 }, { f0: 587, f1: 587, d: 0.4, gap: 0.06, ramp: 0.06 }],
      hold:      [{ f0: 294, f1: 294, d: 0.9, ramp: 0.12, h2: 0.25 }],
      inhale:    [{ f0: 330, f1: 523, d: 0.6, ramp: 0.08 }],
      exhale:    [{ f0: 523, f1: 330, d: 0.6, ramp: 0.08 }],
      'hold-in': [{ f0: 494, f1: 494, d: 0.35, ramp: 0.06 }],
      'hold-out':[{ f0: 330, f1: 330, d: 0.35, ramp: 0.06 }],
      tick:      [{ f0: 740, f1: 740, d: 0.08, ramp: 0.015, a: 0.7 }],
      holdtick:  [{ f0: 440, f1: 440, d: 0.08, ramp: 0.015, a: 0.5 }],
      done:      [{ f0: 440, f1: 440, d: 0.3, ramp: 0.05 }, { f0: 554, f1: 554, d: 0.3, ramp: 0.05 }, { f0: 659, f1: 659, d: 0.7, ramp: 0.06 }]
    },
    wood: {
      name: 'Wood blocks',
      prep:      [{ f0: 880, f1: 880, d: 0.25, decay: true, h2: 0.5 }],
      breathe:   [{ f0: 880, f1: 880, d: 0.2, decay: true, h2: 0.5 }, { f0: 1175, f1: 1175, d: 0.3, gap: 0.02, decay: true, h2: 0.5 }],
      hold:      [{ f0: 440, f1: 440, d: 0.45, decay: true, h2: 0.6 }, { f0: 440, f1: 440, d: 0.45, gap: 0.05, decay: true, h2: 0.6 }],
      inhale:    [{ f0: 660, f1: 660, d: 0.2, decay: true, h2: 0.5 }, { f0: 880, f1: 880, d: 0.3, gap: 0.02, decay: true, h2: 0.5 }],
      exhale:    [{ f0: 880, f1: 880, d: 0.2, decay: true, h2: 0.5 }, { f0: 660, f1: 660, d: 0.3, gap: 0.02, decay: true, h2: 0.5 }],
      'hold-in': [{ f0: 988, f1: 988, d: 0.3, decay: true, h2: 0.5 }],
      'hold-out':[{ f0: 523, f1: 523, d: 0.3, decay: true, h2: 0.5 }],
      tick:      [{ f0: 1320, f1: 1320, d: 0.08, decay: true, h2: 0.4 }],
      holdtick:  [{ f0: 784, f1: 784, d: 0.08, decay: true, h2: 0.4, a: 0.6 }],
      done:      [{ f0: 880, f1: 880, d: 0.25, decay: true, h2: 0.5 }, { f0: 1109, f1: 1109, d: 0.25, decay: true, h2: 0.5 }, { f0: 1320, f1: 1320, d: 0.6, decay: true, h2: 0.5 }]
    }
  };

  var SET_ORDER = ['classic', 'soft', 'wood'];

  function writeNote(buf, at, note, amp) {
    var n = Math.floor(note.d * SAMPLE_RATE);
    var ramp = Math.max(1, Math.floor((note.ramp || 0.008) * SAMPLE_RATE));
    var h2 = note.h2 || 0;
    var phase = 0;
    var twoPi = 2 * Math.PI;
    for (var i = 0; i < n; i++) {
      var idx = at + i;
      if (idx >= buf.length) { break; }
      var frac = n > 1 ? i / (n - 1) : 0;
      var f = note.f0 + (note.f1 - note.f0) * frac;
      phase += twoPi * f / SAMPLE_RATE;
      var env = note.decay ? Math.exp(-5 * frac) : 1;
      if (i < ramp) { env *= i / ramp; }
      if (n - 1 - i < ramp) { env = Math.min(env, (n - 1 - i) / ramp); }
      var wave = (Math.sin(phase) + h2 * Math.sin(2 * phase)) / (1 + h2);
      var v = buf[idx] + wave * env * amp;
      buf[idx] = v > 32767 ? 32767 : (v < -32768 ? -32768 : v);
    }
  }

  function sampleCount(totalSeconds) {
    return Math.ceil((totalSeconds + TAIL) * SAMPLE_RATE);
  }

  /* Writes the cues into an existing sample buffer (already silent). */
  function renderInto(buf, cues, volume, setId) {
    var set = SETS[setId] || SETS.classic;
    var vol = Math.max(0, Math.min(1, volume == null ? 1 : volume));
    var amp = PEAK * vol * 32767;
    cues.forEach(function (cue) {
      var notes = set[cue.tone];
      if (!notes) { return; }
      var t = cue.t;
      notes.forEach(function (note) {
        t += note.gap || 0;
        writeNote(buf, Math.round(t * SAMPLE_RATE), note, amp * (note.a || 1));
        t += note.d;
      });
    });
    return buf;
  }

  function render(cues, totalSeconds, volume, setId) {
    return renderInto(new Int16Array(sampleCount(totalSeconds)), cues, volume, setId);
  }

  function writeHeader(v, dataBytes, rate) {
    function str(off, s) { for (var i = 0; i < s.length; i++) { v.setUint8(off + i, s.charCodeAt(i)); } }
    str(0, 'RIFF');
    v.setUint32(4, 36 + dataBytes, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, dataBytes, true);
  }

  function encodeWav(samples, sampleRate) {
    var out = new ArrayBuffer(44 + samples.length * 2);
    writeHeader(new DataView(out), samples.length * 2, sampleRate || SAMPLE_RATE);
    new Int16Array(out, 44).set(samples);
    return out;
  }

  /* The whole session as one WAV, rendered straight into the file buffer so a long
   * session needs one allocation instead of two. */
  function encodeSession(cues, totalSeconds, volume, setId) {
    var length = sampleCount(totalSeconds);
    var out = new ArrayBuffer(44 + length * 2);
    writeHeader(new DataView(out), length * 2, SAMPLE_RATE);
    renderInto(new Int16Array(out, 44, length), cues, volume, setId);
    return out;
  }

  function makeBlob(cues, totalSeconds, volume, setId) {
    return new Blob([encodeSession(cues, totalSeconds, volume, setId)], { type: 'audio/wav' });
  }

  return {
    SAMPLE_RATE: SAMPLE_RATE,
    TAIL: TAIL,
    SETS: SETS,
    SET_ORDER: SET_ORDER,
    render: render,
    encodeWav: encodeWav,
    encodeSession: encodeSession,
    makeBlob: makeBlob
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = Tones; }
