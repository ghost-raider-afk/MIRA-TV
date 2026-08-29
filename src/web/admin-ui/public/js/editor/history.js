import { replaceEditorState, snapshotEditorState } from './state.js';

export function createEditorHistory(editorState, { limit = 40 } = {}) {
  const undoStack = [];
  const redoStack = [];

  function checkpoint() {
    undoStack.push(snapshotEditorState(editorState));
    if (undoStack.length > limit) undoStack.shift();
    redoStack.length = 0;
  }

  function restore(stack, opposite) {
    const snapshot = stack.pop();
    if (!snapshot) return false;
    opposite.push(snapshotEditorState(editorState));
    replaceEditorState(editorState, snapshot);
    editorState.dirty = true;
    editorState.revision += 1;
    return true;
  }

  return Object.freeze({
    checkpoint,
    undo: () => restore(undoStack, redoStack),
    redo: () => restore(redoStack, undoStack),
    clear: () => { undoStack.length = 0; redoStack.length = 0; },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0
  });
}
