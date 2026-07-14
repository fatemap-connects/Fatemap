import { useState, useCallback, useMemo } from "react";

// ── Design tokens ──────────────────────────────────────────────
// Palette: deep indigo night, blush rose, warm gold, soft cream
// Type: Georgia for display (romantic, editorial), system-ui for UI
// Signature: animated "fate pulse" on crossover markers

const COLORS = {
  bg: "#0d0d1a",
  surface: "#14142b",
  border: "#2a2a4a",
  personA: "#e8a0bf",   // blush rose
  personB: "#7eb8f7",   // sky blue
  fate: "#f5c842",      // warm gold
  text: "#e8e4f0",
  muted: "#7a7a9a",
  cream: "#f5f0e8",
};

// ── Sample/demo data ────────────────────────────────────────────
const SAMPLE_A = [
  { lat: 48.8584, lng: 2.2945, name: "Eiffel Tower, Paris", time: "2021-06-14T15:30:00Z" },
  { lat: 51.5007, lng: -0.1246, name: "Westminster, London", time: "2021-08-22T10:00:00Z" },
  { lat: 40.7484, lng: -73.9857, name: "Empire State Building, NYC", time: "2022-03-05T14:00:00Z" },
  { lat: 35.6762, lng: 139.6503, name: "Shibuya, Tokyo", time: "2022-09-10T19:00:00Z" },
  { lat: 41.9028, lng: 12.4964, name: "Rome Colosseum", time: "2023-04-18T11:00:00Z" },
  { lat: 48.8566, lng: 2.3522, name: "Le Marais, Paris", time: "2023-07-01T18:00:00Z" },
];

const SAMPLE_B = [
  { lat: 48.8560, lng: 2.2950, name: "Champ de Mars, Paris", time: "2021-06-14T16:00:00Z" },
  { lat: 41.9029, lng: 12.4960, name: "Forum Romanum, Rome", time: "2023-04-18T12:00:00Z" },
  { lat: 40.7580, lng: -73.9855, name: "Times Square, NYC", time: "2022-03-06T13:00:00Z" },
  { lat: 35.6895, lng: 139.6917, name: "Shinjuku, Tokyo", time: "2022-09-11T20:00:00Z" },
  { lat: 48.8570, lng: 2.3530, name: "Place des Vosges, Paris", time: "2023-07-01T17:30:00Z" },
  { lat: 52.3676, lng: 4.9041, name: "Amsterdam Canal", time: "2022-05-20T14:00:00Z" },
];

// ── Helpers ─────────────────────────────────────────────────────
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function timeDiffHours(a, b) {
  return Math.abs(new Date(a.time) - new Date(b.time)) / 3600000;
}

function findCrossovers(locA, locB, kmThreshold = 1.0, hourThreshold = 24) {
  const results = [];
  for (const a of locA) {
    for (const b of locB) {
      const km = haversineKm(a, b);
      const hrs = timeDiffHours(a, b);
      if (km <= kmThreshold && hrs <= hourThreshold) {
        results.push({ a, b, km, hrs, id: `${a.time}-${b.time}` });
      }
    }
  }
  return results.sort((x, y) => new Date(x.a.time) - new Date(y.a.time));
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });
}

function parseGoogleTakeout(json) {
  try {
    const data = JSON.parse(json);
    const locations = [];
    // Handle Records format
    const records = data.locations || data.timelineObjects || [];
    for (const rec of records.slice(0, 500)) {
      if (rec.latitudeE7 && rec.longitudeE7) {
        locations.push({
          lat: rec.latitudeE7 / 1e7,
          lng: rec.longitudeE7 / 1e7,
          name: rec.formFactor || "Location",
          time: new Date(parseInt(rec.timestampMs || rec.timestamp)).toISOString(),
        });
      }
      // Also handle placeVisit format
      if (rec.placeVisit) {
        const pv = rec.placeVisit;
        locations.push({
          lat: pv.location.latitudeE7 / 1e7,
          lng: pv.location.longitudeE7 / 1e7,
          name: pv.location.name || "Place",
          time: new Date(pv.duration.startTimestampMs ? parseInt(pv.duration.startTimestampMs) : pv.duration.startTimestamp).toISOString(),
        });
      }
    }
    return locations.filter(l => l.lat && l.lng && !isNaN(new Date(l.time)));
  } catch {
    return null;
  }
}

// ── Simple SVG world map backdrop ───────────────────────────────
// Project lat/lng to a 800x400 equirectangular canvas
function project(lat, lng, w = 800, h = 400) {
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return { x, y };
}

// ── Components ──────────────────────────────────────────────────

function UploadPanel({ label, color, onData, loaded }) {
  const [dragging, setDragging] = useState(false);

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseGoogleTakeout(e.target.result);
      onData(parsed || []);
    };
    reader.readAsText(file);
  };

  return (
    <div
      style={{
        border: `1.5px dashed ${dragging ? color : COLORS.border}`,
        borderRadius: 16,
        padding: "28px 20px",
        background: dragging ? `${color}11` : COLORS.surface,
        transition: "all 0.2s",
        cursor: "pointer",
        textAlign: "center",
        position: "relative",
      }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      onClick={() => document.getElementById(`file-${label}`).click()}
    >
      <input
        id={`file-${label}`}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }}
      />
      <div style={{ fontSize: 28, marginBottom: 8 }}>
        {loaded ? "✓" : "📍"}
      </div>
      <div style={{
        fontFamily: "Georgia, serif",
        fontSize: 16,
        color: loaded ? color : COLORS.text,
        marginBottom: 4,
        fontWeight: loaded ? "bold" : "normal",
      }}>
        {loaded ? `${label} — loaded` : label}
      </div>
      <div style={{ fontSize: 12, color: COLORS.muted }}>
        {loaded
          ? "Click to replace"
          : "Drop Google Takeout location-history.json"}
      </div>
    </div>
  );
}

function MapView({ locA, locB, crossovers, selected, onSelect }) {
  const W = 800, H = 380;
  const allLocs = [...locA, ...locB];
  if (allLocs.length === 0) return null;

  // Compute bounding box
  const lats = allLocs.map(l => l.lat);
  const lngs = allLocs.map(l => l.lng);
  const minLat = Math.min(...lats) - 5;
  const maxLat = Math.max(...lats) + 5;
  const minLng = Math.min(...lngs) - 5;
  const maxLng = Math.max(...lngs) + 5;

  function proj(lat, lng) {
    const x = ((lng - minLng) / (maxLng - minLng)) * (W - 60) + 30;
    const y = ((maxLat - lat) / (maxLat - minLat)) * (H - 60) + 30;
    return { x, y };
  }

  const crossoverIds = new Set(crossovers.flatMap(c => [c.a.time, c.b.time]));

  return (
    <div style={{ borderRadius: 16, overflow: "hidden", background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <rect width={W} height={H} fill={COLORS.surface} />
        {/* Grid lines */}
        {[...Array(6)].map((_, i) => (
          <line key={i} x1={30 + i * (W-60)/5} y1={30} x2={30 + i * (W-60)/5} y2={H-30}
            stroke={COLORS.border} strokeWidth={0.5} />
        ))}
        {[...Array(4)].map((_, i) => (
          <line key={i} x1={30} y1={30 + i * (H-60)/3} x2={W-30} y2={30 + i * (H-60)/3}
            stroke={COLORS.border} strokeWidth={0.5} />
        ))}

        {/* Connecting lines for crossovers */}
        {crossovers.map((c) => {
          const pa = proj(c.a.lat, c.a.lng);
          const pb = proj(c.b.lat, c.b.lng);
          return (
            <line key={c.id}
              x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke={COLORS.fate} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.5} />
          );
        })}

        {/* Person A dots */}
        {locA.map((l, i) => {
          const p = proj(l.lat, l.lng);
          const isCross = crossoverIds.has(l.time);
          return (
            <circle key={i} cx={p.x} cy={p.y} r={isCross ? 0 : 4}
              fill={COLORS.personA} opacity={0.6} />
          );
        })}

        {/* Person B dots */}
        {locB.map((l, i) => {
          const p = proj(l.lat, l.lng);
          const isCross = crossoverIds.has(l.time);
          return (
            <circle key={i} cx={p.x} cy={p.y} r={isCross ? 0 : 4}
              fill={COLORS.personB} opacity={0.6} />
          );
        })}

        {/* Fate crossover markers */}
        {crossovers.map((c) => {
          const midLat = (c.a.lat + c.b.lat) / 2;
          const midLng = (c.a.lng + c.b.lng) / 2;
          const p = proj(midLat, midLng);
          const isSelected = selected?.id === c.id;
          return (
            <g key={c.id} style={{ cursor: "pointer" }} onClick={() => onSelect(c)}>
              <circle cx={p.x} cy={p.y} r={isSelected ? 18 : 14}
                fill="none" stroke={COLORS.fate} strokeWidth={1.5} opacity={0.3} />
              <circle cx={p.x} cy={p.y} r={isSelected ? 10 : 7}
                fill={COLORS.fate} opacity={isSelected ? 1 : 0.85} />
              <text x={p.x} y={p.y + 4} textAnchor="middle"
                fontSize={isSelected ? 10 : 8} fill={COLORS.bg}>✦</text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, padding: "10px 16px", borderTop: `1px solid ${COLORS.border}` }}>
        {[["●", COLORS.personA, "Person A"], ["●", COLORS.personB, "Person B"], ["✦", COLORS.fate, "Fate moment"]].map(([sym, col, lbl]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.muted }}>
            <span style={{ color: col }}>{sym}</span> {lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineItem({ crossover, isSelected, onClick, namesA, namesB }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? `${COLORS.fate}18` : COLORS.surface,
        border: `1px solid ${isSelected ? COLORS.fate : COLORS.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        cursor: "pointer",
        transition: "all 0.2s",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: `${COLORS.fate}22`, border: `1.5px solid ${COLORS.fate}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, flexShrink: 0,
        }}>✦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 15, color: COLORS.text, marginBottom: 4 }}>
            {crossover.a.name}
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>
            {formatDate(crossover.a.time)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, background: `${COLORS.personA}22`, color: COLORS.personA, padding: "2px 8px", borderRadius: 20 }}>
              {namesA} · {formatTime(crossover.a.time)}
            </span>
            <span style={{ fontSize: 11, background: `${COLORS.personB}22`, color: COLORS.personB, padding: "2px 8px", borderRadius: 20 }}>
              {namesB} · {formatTime(crossover.b.time)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8 }}>
            {crossover.km < 0.1
              ? "Same spot"
              : `${(crossover.km * 1000).toFixed(0)}m apart`}
            {" · "}
            {crossover.hrs < 1
              ? `${Math.round(crossover.hrs * 60)} min apart`
              : `${crossover.hrs.toFixed(1)} hrs apart`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function FateMap() {
  const [locA, setLocA] = useState(null);
  const [locB, setLocB] = useState(null);
  const [nameA, setNameA] = useState("Person A");
  const [nameB, setNameB] = useState("Person B");
  const [metDate, setMetDate] = useState("");
  const [kmThreshold, setKmThreshold] = useState(1.0);
  const [selected, setSelected] = useState(null);
  const [useSample, setUseSample] = useState(false);
  const [tab, setTab] = useState("map"); // "map" | "timeline"

  const activeA = useSample ? SAMPLE_A : (locA || []);
  const activeB = useSample ? SAMPLE_B : (locB || []);

  const allCrossovers = useMemo(
    () => findCrossovers(activeA, activeB, kmThreshold, 48),
    [activeA, activeB, kmThreshold]
  );

  const beforeMet = useMemo(() => {
    if (!metDate) return allCrossovers;
    return allCrossovers.filter(c => new Date(c.a.time) < new Date(metDate));
  }, [allCrossovers, metDate]);

  const afterMet = useMemo(() => {
    if (!metDate) return [];
    return allCrossovers.filter(c => new Date(c.a.time) >= new Date(metDate));
  }, [allCrossovers, metDate]);

  const hasData = useSample || (locA && locB);

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "system-ui, sans-serif",
      padding: "0 0 60px",
    }}>
      {/* Header */}
      <div style={{
        textAlign: "center",
        padding: "48px 24px 32px",
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ fontSize: 13, letterSpacing: 3, color: COLORS.fate, textTransform: "uppercase", marginBottom: 12 }}>
          Fate Map
        </div>
        <h1 style={{
          fontFamily: "Georgia, serif",
          fontSize: "clamp(28px, 5vw, 44px)",
          fontWeight: "normal",
          margin: "0 0 12px",
          color: COLORS.cream,
          lineHeight: 1.2,
        }}>
          Where your paths crossed<br />before you knew each other
        </h1>
        <p style={{ color: COLORS.muted, fontSize: 15, maxWidth: 440, margin: "0 auto" }}>
          Upload location histories to discover the moments you were unknowingly close.
        </p>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 20px" }}>

        {/* Setup panel */}
        <div style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: "28px 24px",
          marginTop: 32,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: COLORS.muted, textTransform: "uppercase", marginBottom: 20 }}>
            Setup
          </div>

          {/* Names */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[[nameA, setNameA, COLORS.personA], [nameB, setNameB, COLORS.personB]].map(([val, set, col], i) => (
              <div key={i}>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 6, letterSpacing: 1 }}>
                  {i === 0 ? "PERSON A" : "PERSON B"}
                </label>
                <input
                  value={val}
                  onChange={e => set(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: COLORS.bg, border: `1px solid ${col}44`,
                    borderRadius: 8, padding: "8px 12px",
                    color: col, fontSize: 14, outline: "none",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Met date */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 6, letterSpacing: 1 }}>
              WHEN DID YOU MEET? (optional — splits results into "before" and "after")
            </label>
            <input
              type="date"
              value={metDate}
              onChange={e => setMetDate(e.target.value)}
              style={{
                background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                borderRadius: 8, padding: "8px 12px",
                color: COLORS.text, fontSize: 14, outline: "none",
                colorScheme: "dark",
              }}
            />
          </div>

          {/* Proximity slider */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 6, letterSpacing: 1 }}>
              PROXIMITY THRESHOLD — {kmThreshold < 1 ? `${kmThreshold * 1000}m` : `${kmThreshold}km`}
            </label>
            <input type="range" min={0.1} max={5} step={0.1} value={kmThreshold}
              onChange={e => setKmThreshold(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: COLORS.fate }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
              <span>100m — same block</span><span>5km — same area</span>
            </div>
          </div>

          {/* Upload areas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <UploadPanel label={nameA} color={COLORS.personA}
              onData={setLocA} loaded={!!locA} />
            <UploadPanel label={nameB} color={COLORS.personB}
              onData={setLocB} loaded={!!locB} />
          </div>

          {/* Demo option */}
          <div style={{ textAlign: "center" }}>
            <span style={{ color: COLORS.muted, fontSize: 13 }}>No data yet? </span>
            <button
              onClick={() => { setUseSample(!useSample); setLocA(null); setLocB(null); }}
              style={{
                background: "none", border: "none",
                color: useSample ? COLORS.fate : COLORS.personA,
                fontSize: 13, cursor: "pointer", textDecoration: "underline",
                padding: 0,
              }}
            >
              {useSample ? "Stop using sample data" : "Try with sample data"}
            </button>
          </div>
        </div>

        {/* Results */}
        {hasData && (
          <div style={{ marginTop: 32 }}>

            {/* Stats bar */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12, marginBottom: 24,
            }}>
              {[
                ["Total crossovers", allCrossovers.length, COLORS.fate],
                ["Before you met", beforeMet.length, COLORS.personA],
                ["After you met", afterMet.length, COLORS.personB],
              ].map(([label, val, col]) => (
                <div key={label} style={{
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 14, padding: "18px 16px", textAlign: "center",
                }}>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: 32, color: col, lineHeight: 1 }}>
                    {val}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6, letterSpacing: 1 }}>
                    {label.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
              {[["map", "🗺  Map"], ["timeline", "✦  Timeline"]].map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} style={{
                  background: tab === key ? COLORS.fate : COLORS.surface,
                  color: tab === key ? COLORS.bg : COLORS.muted,
                  border: `1px solid ${tab === key ? COLORS.fate : COLORS.border}`,
                  borderRadius: 8, padding: "8px 18px", fontSize: 13,
                  cursor: "pointer", fontWeight: tab === key ? "bold" : "normal",
                  transition: "all 0.15s",
                }}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "map" && (
              <>
                <MapView
                  locA={activeA} locB={activeB}
                  crossovers={allCrossovers}
                  selected={selected}
                  onSelect={setSelected}
                />
                {selected && (
                  <div style={{
                    marginTop: 16,
                    background: `${COLORS.fate}12`,
                    border: `1px solid ${COLORS.fate}55`,
                    borderRadius: 14, padding: "18px 20px",
                  }}>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 17, color: COLORS.cream, marginBottom: 8 }}>
                      ✦ {selected.a.name}
                    </div>
                    <div style={{ fontSize: 13, color: COLORS.muted }}>
                      {nameA} was here on {formatDate(selected.a.time)} at {formatTime(selected.a.time)}<br />
                      {nameB} was here on {formatDate(selected.b.time)} at {formatTime(selected.b.time)}<br />
                      {selected.km < 0.1 ? "Exactly the same spot" : `${(selected.km * 1000).toFixed(0)}m apart`}
                      {" — "}
                      {selected.hrs < 1
                        ? `${Math.round(selected.hrs * 60)} minutes from each other`
                        : `${selected.hrs.toFixed(1)} hours from each other`}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === "timeline" && (
              <div>
                {allCrossovers.length === 0 && (
                  <div style={{ textAlign: "center", color: COLORS.muted, padding: 40 }}>
                    No crossovers found at this proximity. Try increasing the threshold.
                  </div>
                )}

                {metDate && beforeMet.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, letterSpacing: 2, color: COLORS.fate, textTransform: "uppercase", marginBottom: 14 }}>
                      ✦ Before you met — fate moments
                    </div>
                    {beforeMet.map(c => (
                      <TimelineItem key={c.id} crossover={c}
                        isSelected={selected?.id === c.id}
                        onClick={() => setSelected(selected?.id === c.id ? null : c)}
                        namesA={nameA} namesB={nameB} />
                    ))}
                  </>
                )}

                {(!metDate || afterMet.length > 0 || (metDate && beforeMet.length === 0)) && (
                  <>
                    {metDate && afterMet.length > 0 && (
                      <div style={{ fontSize: 11, letterSpacing: 2, color: COLORS.personB, textTransform: "uppercase", margin: "24px 0 14px" }}>
                        ● Shared memories together
                      </div>
                    )}
                    {(metDate ? afterMet : allCrossovers).map(c => (
                      <TimelineItem key={c.id} crossover={c}
                        isSelected={selected?.id === c.id}
                        onClick={() => setSelected(selected?.id === c.id ? null : c)}
                        namesA={nameA} namesB={nameB} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Privacy note */}
        <div style={{
          marginTop: 40, padding: "16px 20px",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12, fontSize: 12, color: COLORS.muted, lineHeight: 1.6,
        }}>
          🔒 <strong style={{ color: COLORS.text }}>Privacy first.</strong> All data is processed locally in your browser.
          Nothing is uploaded to any server. Location files never leave your device.
        </div>
      </div>
    </div>
  );
}
