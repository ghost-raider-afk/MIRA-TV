import { normaliseEditorSettings } from './settings.js';

export function serializeDraft(editorState, screen = null) {
  return {
    rows: structuredClone(Array.isArray(editorState.rows) ? editorState.rows : []),
    settings: normaliseEditorSettings(editorState.settings || {}),
    scene: structuredClone(editorState.scene && typeof editorState.scene === 'object' ? editorState.scene : { version: 1, elements: [] }),
    revision: editorState.draftRevision,
    ...(screen ? { screen: structuredClone(screen) } : {})
  };
}
