/* Start-up and the wiring that crosses views: navigation, keyboard, visibility, storage flush. */
(function () {
  'use strict';

  var $ = UI.$;

  function bind() {
    $('nav-setup').addEventListener('click', function () { SetupView.refresh(); UI.showView('setup'); });
    $('nav-history').addEventListener('click', function () { HistoryView.render(); UI.showView('history'); });
    $('nav-settings').addEventListener('click', function () { SettingsView.render(); UI.showView('settings'); });

    // iOS Safari never fires beforeunload, so flush whenever the page goes to the background.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { State.saveNow(); } else { SessionView.resume(); }
    });
    window.addEventListener('pageshow', function () { SessionView.loop(); });
    window.addEventListener('hashchange', function () {
      if (SessionView.active()) { return; }   // the setup view picks the link up when the session ends
      SetupView.refresh();
      UI.showView('setup');
    });

    document.addEventListener('keydown', function (e) {
      if (!SessionView.active() || e.target.tagName === 'INPUT') { return; }
      if (e.key === ' ') { e.preventDefault(); SessionView.togglePause(); }
      if (e.key === 'ArrowRight') { SessionView.skip(); }
      if (e.key === 'ArrowLeft') { SessionView.previous(); }
      if (e.key === 'u' || e.key === 'U') { SessionView.markUrge(); }
      if (e.key === 'Escape') { $('btn-stop').click(); }
    });

    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { UI.applyTheme(State.settings.theme); });
    window.addEventListener('beforeunload', State.saveNow);
    window.addEventListener('pagehide', State.saveNow);
  }

  function init() {
    UI.applyTheme(State.settings.theme);
    $('standalone-note').hidden = navigator.standalone !== true;
    Player.init($('audio'));
    UI.makeBubbles($('bubbles'), 14, 9);
    UI.makeBubbles($('done-bubbles'), 24, 4);
    bind();
    SetupView.bind();
    PresetActions.bind();
    SessionView.bind();
    DoneView.bind();
    HistoryView.bind();
    SettingsView.bind();
    SetupView.refresh();
    SettingsView.render();
    UI.showView('setup');
    if (window.location.protocol === 'https:' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
    }
  }

  init();
})();
