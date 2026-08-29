const KNOWN_CLAIMS = Object.freeze(['transform', 'opacity', 'appearance']);

function freezeTrack(programId, track) {
  const claims = [...new Set(Array.isArray(track?.claims) ? track.claims : [])];
  if (!track?.node?.id) throw new TypeError(`Scene program ${programId} contains a track without node id.`);
  if (!claims.length) throw new TypeError(`Scene program ${programId} track ${track.node.id} has no claims.`);
  for (const claim of claims) {
    if (!KNOWN_CLAIMS.includes(claim)) throw new TypeError(`Unknown scene claim: ${claim}`);
  }
  return Object.freeze({
    ...track,
    programId,
    claims: Object.freeze(claims)
  });
}

export function createSceneProgram({ id, duration, tracks = [], metadata = {} }) {
  const programId = String(id || '').trim();
  if (!programId) throw new TypeError('Scene program requires an id.');
  const resolvedDuration = Number(duration);
  if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) throw new TypeError(`Scene program ${programId} requires a positive duration.`);
  return Object.freeze({
    id: programId,
    duration: resolvedDuration,
    tracks: Object.freeze(tracks.map((track) => freezeTrack(programId, track))),
    metadata: Object.freeze({ ...metadata })
  });
}

function validateTrackNode(scene, track) {
  const node = scene?.node?.(track.node.id);
  if (!node) throw new Error(`Scene program ${track.programId} references unknown node ${track.node.id}.`);
  if (node !== track.node) throw new Error(`Scene program ${track.programId} must use the canonical scene node ${track.node.id}.`);
}

export function composeScenePrograms(scene, programs = []) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Scene composer requires a scene graph.');
  const activePrograms = programs.filter(Boolean);
  if (!activePrograms.length) throw new TypeError('Scene composer requires at least one program.');

  const programIds = new Set();
  const claims = new Map();
  const tracks = [];
  for (const program of activePrograms) {
    if (!program?.id || !Array.isArray(program.tracks)) throw new TypeError('Scene composer received an invalid program.');
    if (programIds.has(program.id)) throw new Error(`Duplicate scene program id: ${program.id}.`);
    programIds.add(program.id);

    for (const track of program.tracks) {
      validateTrackNode(scene, track);
      for (const claim of track.claims) {
        const key = `${track.node.id}:${claim}`;
        const owner = claims.get(key);
        if (owner) throw new Error(`Scene ownership conflict for ${key}: ${owner} vs ${program.id}.`);
        claims.set(key, program.id);
      }
      tracks.push(track);
    }
  }

  const duration = Math.max(...activePrograms.map((program) => Number(program.duration) || 0));
  return Object.freeze({
    version: 3,
    duration,
    scene,
    programs: Object.freeze([...activePrograms]),
    tracks: Object.freeze(tracks),
    ownership: Object.freeze(Object.fromEntries(claims)),
    clock: Object.freeze({ duration, loop: true })
  });
}
