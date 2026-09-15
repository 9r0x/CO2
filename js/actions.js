/* Preset actions on the Train tab: save, reset, delete, share links and importing a link. */
var PresetActions = (function () {
  'use strict';

  var $ = UI.$;
  var disarmDelete = function () {};

  /* ---------------- presets: save / reset / delete ---------------- */

  function hideRows() {
    $('save-row').hidden = true;
    $('share-row').hidden = true;
  }

  function onSavePreset() {
    hideRows();
    $('save-row').hidden = false;
    var input = $('preset-name');
    input.value = State.cfg().name + ' copy';
    input.focus();
    input.select();
  }

  function onSaveConfirm() {
    var name = $('preset-name').value.trim();
    if (!name) { $('preset-name').focus(); return; }
    var copy = Presets.clone(State.cfg());
    copy.name = name;
    State.addPreset(copy);
    disarmDelete();
    hideRows();
    SetupView.refresh();
  }

  function onResetPreset() {
    State.resetPreset(State.current());
    SetupView.refresh();
  }

  function onDeletePreset() {
    State.removePreset(State.current());
    SetupView.select('co2');
  }

  /* ---------------- share links ---------------- */

  function shareUrl() {
    return window.location.href.split('#')[0] + '#p=' + Presets.encodeShare(State.cfg(), State.config);
  }

  function onShare() {
    hideRows();
    $('share-row').hidden = false;
    $('share-url').value = shareUrl();
    $('btn-share-copy').textContent = 'Copy';
    $('btn-share-native').hidden = !('share' in navigator);
  }

  function onShareCopy() {
    var input = $('share-url');
    input.focus();
    input.select();
    UI.copyText(input.value).then(function (ok) { if (ok) { $('btn-share-copy').textContent = 'Copied'; } });
  }

  function onShareNative() {
    navigator.share({ title: State.cfg().name + ' - Breath Trainer', url: $('share-url').value }).catch(function () {});
  }

  /* #p=... in the address bar: add the preset to the list and select it. */
  function importFromHash() {
    var m = window.location.hash.match(/^#p=([A-Za-z0-9_-]+)$/);
    if (!m) { return; }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    var shared = Presets.decodeShare(m[1]);
    if (!shared) { return; }
    disarmDelete();
    hideRows();
    var info = $('setup-info');
    info.hidden = false;
    if (shared.kind === 'chain') {
      var ids = shared.parts.map(State.addPreset);
      State.addPreset({ kind: 'chain', name: shared.name, why: shared.why, items: ids });
      info.textContent = 'Added the shared session "' + shared.name + '" and its ' + ids.length + (ids.length === 1 ? ' part.' : ' parts.') + ' They are yours to edit, rename or delete.';
      return;
    }
    State.addPreset(shared);
    info.textContent = 'Added the shared preset "' + shared.name + '". It is yours to edit, rename or delete.';
  }

  /* Called when another preset is selected: close the rows and drop an armed delete. */
  function reset() {
    disarmDelete();
    hideRows();
    $('setup-info').hidden = true;
  }

  function bind() {
    $('btn-save-preset').addEventListener('click', onSavePreset);
    $('btn-save-confirm').addEventListener('click', onSaveConfirm);
    $('btn-save-cancel').addEventListener('click', hideRows);
    $('preset-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); onSaveConfirm(); } });
    $('btn-reset-preset').addEventListener('click', onResetPreset);
    disarmDelete = UI.armed($('btn-delete-preset'), 'Tap again to delete', onDeletePreset);
    $('btn-share').addEventListener('click', onShare);
    $('btn-share-copy').addEventListener('click', onShareCopy);
    $('btn-share-native').addEventListener('click', onShareNative);
    $('btn-share-close').addEventListener('click', hideRows);
  }

  return {
    reset: reset,
    importFromHash: importFromHash,
    bind: bind
  };
})();
