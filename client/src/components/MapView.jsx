import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';

export const LEVEL_COLOR = { high: '#c8332c', medium: '#d98e04', low: '#2f8a57', unavailable: '#7b8a90' };
/** Zoom the map to whatever is being shown (one state, or all of India). */
function FitBounds({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

const STATUS_COLOR = { closed: '#c8332c', degraded: '#d98e04', open: '#5b7a85' };

/**
 * Props:
 *  risks[]       region risk results (center, level, name, score)
 *  regions[]     regions with settlements (optional)
 *  suppliers[]   suppliers (staff only)
 *  roads         { nodes, edges } for the network overlay (staff only)
 *  routes[]      [{ id, coords, status, label }] planned delivery routes
 */
export default function MapView({ risks = [], regions = [], suppliers = [], roads, routes = [], height = 440 }) {
  const points = risks.length ? risks.map((r) => [r.center.lat, r.center.lon])
    : suppliers.length ? suppliers.map((x) => [x.location.lat, x.location.lon])
    : (roads?.nodes || []).map((n) => [n.lat, n.lon]);
  const nodeBy = roads ? Object.fromEntries(roads.nodes.map((n) => [n.code, n])) : {};
  return (
    <div className="map-wrap" style={{ height }}>
      <MapContainer center={[22.5, 80.0]} zoom={5} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <FitBounds points={points} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {roads?.edges.map((e) => {
          const a = nodeBy[e.from]; const b = nodeBy[e.to];
          if (!a || !b) return null;
          const st = e.effectiveStatus || e.status;
          return (
            <Polyline key={e.code} positions={[[a.lat, a.lon], [b.lat, b.lon]]}
              pathOptions={{ color: STATUS_COLOR[st], weight: st === 'open' ? 2 : 4, opacity: 0.7, dashArray: e.kind === 'ferry' ? '2 6' : st === 'closed' ? '8 6' : undefined }}>
              <Tooltip sticky>{e.name}: {st}</Tooltip>
            </Polyline>
          );
        })}

        {routes.map((r) => (
          <Polyline key={r.id} positions={r.coords} pathOptions={{ color: r.status === 'rerouted' ? '#7b3fb0' : '#0e6e8c', weight: 5, opacity: 0.9 }}>
            <Tooltip sticky>{r.label}{r.status === 'rerouted' ? ' (rerouted)' : ''}</Tooltip>
          </Polyline>
        ))}

        {risks.map((r) => (
          <CircleMarker key={r.regionCode} center={[r.center.lat, r.center.lon]} radius={(r.level === 'high' ? 16 : r.level === 'medium' ? 13 : 10) * (risks.length > 12 ? 0.6 : 1)}
            pathOptions={{ color: '#0f2a33', weight: 2, fillColor: LEVEL_COLOR[r.level], fillOpacity: 0.85 }}>
            <Popup>
              <strong>{r.name}</strong><br />
              {r.level === 'unavailable' ? 'Risk unavailable: weather data missing' : `Estimated ${r.level} risk (score ${r.score})`}
              {r.weather && r.weather.rain24h != null && <><br />Forecast rain 24 h: {r.weather.rain24h} mm</>}
            </Popup>
          </CircleMarker>
        ))}

        {regions.flatMap((reg) => reg.settlements.map((s) => (
          <CircleMarker key={`${reg.code}-${s.name}`} center={[s.lat, s.lon]} radius={4} pathOptions={{ color: '#0f2a33', weight: 1, fillColor: '#ffffff', fillOpacity: 1 }}>
            <Tooltip>{s.name}{s.population == null ? ' (population unknown)' : ` · pop. ${Number(s.population).toLocaleString('en-IN')}`}</Tooltip>
          </CircleMarker>
        )))}

        {suppliers.map((s) => (
          <CircleMarker key={s.code} center={[s.location.lat, s.location.lon]} radius={7}
            pathOptions={{ color: '#0f2a33', weight: 2, fillColor: s.assessment?.quality === 'invalid' ? '#7b8a90' : '#56c2e0', fillOpacity: 1 }}>
            <Tooltip>{s.name}{s.assessment?.quality !== 'ok' ? ` (${s.assessment?.quality})` : ''}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
