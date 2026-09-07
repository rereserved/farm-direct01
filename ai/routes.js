/**
 * Nearest-neighbor + 2-opt improvement for delivery route optimization.
 * Input: depot {lat,lng}, stops [{id, lat, lng}]
 * Output: optimized order + total distance saved vs naive route
 */
function haversine(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function totalDist(depot, order) {
  let d = 0, prev = depot;
  for (const s of order) { d += haversine(prev, s); prev = s; }
  return d + haversine(prev, depot);
}

function optimizeRoute(depot, stops) {
  if (stops.length < 2) return { route: stops, distance_km: totalDist(depot, stops), saved_km: 0 };

  // Phase 1: nearest neighbor
  let remaining = [...stops], route = [], cur = depot;
  while (remaining.length) {
    remaining.sort((a, b) => haversine(cur, a) - haversine(cur, b));
    cur = remaining.shift();
    route.push(cur);
  }

  // Phase 2: 2-opt improvement
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const newRoute = [...route];
        const seg = newRoute.slice(i, j + 1).reverse();
        newRoute.splice(i, seg.length, ...seg);
        if (totalDist(depot, newRoute) < totalDist(depot, route)) {
          route = newRoute; improved = true;
        }
      }
    }
  }

  const optimized = totalDist(depot, route);
  const naive = totalDist(depot, [...stops].reverse());
  return { route, distance_km: Math.round(optimized * 10) / 10, saved_km: Math.round((naive - optimized) * 10) / 10 };
}

module.exports = { optimizeRoute };
