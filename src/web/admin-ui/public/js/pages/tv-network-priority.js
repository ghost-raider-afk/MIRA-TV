function latestSeen(binding) {
  return binding?.realtime_last_seen_at || binding?.session_last_seen_at || binding?.device_last_seen_at || null;
}

export function locationOperationalPriority(locationId, screens = [], bindings = []) {
  const screenIds = new Set(screens
    .filter((screen) => Number(screen.location_id) === Number(locationId))
    .map((screen) => Number(screen.id)));
  const connected = bindings.filter((binding) => screenIds.has(Number(binding.screen_id)));
  if (!connected.length) return 3;
  if (connected.some((binding) => binding.online !== true && latestSeen(binding))) return 0;
  if (connected.some((binding) => binding.online === true)) return 1;
  return 2;
}

export function sortLocationsByOperationalPriority(locations = [], screens = [], bindings = []) {
  return locations
    .map((location, index) => ({
      location,
      index,
      priority:locationOperationalPriority(location.id, screens, bindings)
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(({ location }) => location);
}
