export const SITE = [77.4538, 28.6692];
export function metres([lng, lat], origin = SITE) {
  return [(lng - origin[0]) * 111320 * Math.cos(origin[1] * Math.PI / 180), (lat - origin[1]) * 111320];
}
export function coordinates([x, y]) { return [SITE[0] + x / (111320 * Math.cos(SITE[1] * Math.PI / 180)), SITE[1] + y / 111320]; }
export function segmentDistance(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}
export function nearestUtility(position, features) {
  let nearest = null;
  for (const feature of features) {
    const line = feature.geometry.coordinates.map(pair => metres(pair));
    for (let i = 1; i < line.length; i++) {
      const distance = segmentDistance(metres(position), line[i - 1], line[i]);
      if (!nearest || distance < nearest.distance) nearest = { distance, feature };
    }
  }
  return nearest;
}
export const proximityLevel = distance => distance <= 5 ? 'stop' : distance <= 10 ? 'warning' : distance <= 20 ? 'caution' : 'outside';
