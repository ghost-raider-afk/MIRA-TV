import assert from 'node:assert/strict';
import test from 'node:test';

const modules = [
  '../src/web/admin-ui/public/js/core/api.js',
  '../src/web/admin-ui/public/js/core/config.js',
  '../src/web/admin-ui/public/js/core/state.js',
  '../src/web/admin-ui/public/js/core/dom.js',
  '../src/web/admin-ui/public/js/core/events.js',
  '../src/web/admin-ui/public/js/core/navigation.js',
  '../src/web/admin-ui/public/js/core/notifications.js',
  '../src/web/admin-ui/public/js/core/presentation.js',
  '../src/web/admin-ui/public/js/core/session.js',
  '../src/web/admin-ui/public/js/components/icons.js',
  '../src/web/admin-ui/public/js/components/sidebar.js',
  '../src/web/admin-ui/public/js/components/context-panel.js',
  '../src/web/admin-ui/public/js/components/notifications.js',
  '../src/web/admin-ui/public/js/components/header.js',
  '../src/web/admin-ui/public/js/components/dialogs.js',
  '../src/web/admin-ui/public/js/components/shell.js',
  '../src/web/admin-ui/public/js/pages/dashboard.js',
  '../src/web/admin-ui/public/js/pages/signin.js',
  '../src/web/admin-ui/public/js/pages/screens.js',
  '../src/web/admin-ui/public/js/pages/catalog.js',
  '../src/web/admin-ui/public/js/pages/locations.js',
  '../src/web/admin-ui/public/js/pages/profile.js',
  '../src/web/admin-ui/public/js/pages/settings.js',
  '../src/web/admin-ui/public/js/pages/playlist.js',
  '../src/web/admin-ui/public/js/motion/scene-playlist-runtime.js',
  '../src/web/admin-ui/public/js/motion/scene-playlist-editor.js',
  '../src/web/admin-ui/public/js/editor/state.js',
  '../src/web/admin-ui/public/js/editor/commands.js',
  '../src/web/admin-ui/public/js/editor/history.js',
  '../src/web/admin-ui/public/js/editor/properties.js',
  '../src/web/admin-ui/public/js/editor/renderer.js',
  '../src/web/admin-ui/public/js/editor/settings.js',
  '../src/web/admin-ui/public/js/editor/serializer.js',
  '../src/web/admin-ui/public/js/editor/preview.js',
  '../src/web/admin-ui/public/js/editor/final-image.js',
  '../src/web/admin-ui/public/js/editor/rows.js',
  '../src/web/admin-ui/public/js/editor/editor.js'
];

test('frontend modules resolve as a complete ES module graph', async () => {
  for (const modulePath of modules) {
    const loaded = await import(modulePath);
    assert.equal(typeof loaded, 'object', modulePath);
  }
});
