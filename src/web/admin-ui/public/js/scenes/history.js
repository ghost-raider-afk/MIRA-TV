const SERVER_FIELDS = Object.freeze(['server_revision', 'created_at', 'updated_at']);

function clone(value) {
  return structuredClone(value);
}

function authoringScene(scene) {
  const snapshot = clone(scene);
  for (const field of SERVER_FIELDS) delete snapshot[field];
  return snapshot;
}

function snapshot(scene, selectedElementId) {
  return {
    scene: authoringScene(scene),
    selected_element_id: selectedElementId || null
  };
}

function sameSnapshot(left, right) {
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function restoreAuthoringSnapshot(currentScene, entry) {
  if (!currentScene || !entry?.scene) return null;
  const restored = clone(entry.scene);
  restored.id = currentScene.id;
  for (const field of SERVER_FIELDS) {
    if (Object.hasOwn(currentScene, field)) restored[field] = currentScene[field];
  }
  return {
    scene: restored,
    selectedElementId: entry.selected_element_id || null
  };
}

export function createSceneHistory({ limit = 100 } = {}) {
  const maxEntries = Number.isSafeInteger(limit) && limit > 0 ? limit : 100;
  const past = [];
  const future = [];
  let activeGroup = null;

  function capture(scene, selectedElementId, groupKey = null) {
    const key = groupKey ? String(groupKey) : null;
    if (key && key === activeGroup) return false;
    const entry = snapshot(scene, selectedElementId);
    if (!sameSnapshot(past[past.length - 1], entry)) {
      past.push(entry);
      if (past.length > maxEntries) past.splice(0, past.length - maxEntries);
    }
    future.length = 0;
    activeGroup = key;
    return true;
  }

  function closeGroup() {
    activeGroup = null;
  }

  function undo(scene, selectedElementId) {
    if (!past.length) return null;
    future.push(snapshot(scene, selectedElementId));
    activeGroup = null;
    return restoreAuthoringSnapshot(scene, past.pop());
  }

  function redo(scene, selectedElementId) {
    if (!future.length) return null;
    past.push(snapshot(scene, selectedElementId));
    if (past.length > maxEntries) past.splice(0, past.length - maxEntries);
    activeGroup = null;
    return restoreAuthoringSnapshot(scene, future.pop());
  }

  function reset() {
    past.length = 0;
    future.length = 0;
    activeGroup = null;
  }

  return Object.freeze({
    capture,
    closeGroup,
    undo,
    redo,
    reset,
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get pastSize() { return past.length; },
    get futureSize() { return future.length; }
  });
}
