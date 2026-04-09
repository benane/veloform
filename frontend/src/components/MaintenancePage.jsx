import { useState, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import dayjs from "dayjs";

const COMPONENT_TYPES = [
  { id: "chain",              label: "Kette" },
  { id: "cassette",           label: "Kassette" },
  { id: "brake_pads_front",   label: "Bremsbeläge vorne" },
  { id: "brake_pads_rear",    label: "Bremsbeläge hinten" },
  { id: "tire_front",         label: "Reifen vorne" },
  { id: "tire_rear",          label: "Reifen hinten" },
  { id: "inner_tube_front",   label: "Schlauch vorne" },
  { id: "inner_tube_rear",    label: "Schlauch hinten" },
  { id: "brake_rotor_front",  label: "Bremsrotor vorne" },
  { id: "brake_rotor_rear",   label: "Bremsrotor hinten" },
  { id: "battery_powermeter", label: "Batterie Power Meter" },
  { id: "battery_di2",        label: "Batterie Shimano Di2" },
  { id: "battery_axs",        label: "Batterie SRAM AXS" },
];

const ACTION_TYPES = [
  { id: "checked",       label: "Geprüft" },
  { id: "waxed",         label: "Gewachst" },
  { id: "lubricated",    label: "Geölt" },
  { id: "charged",       label: "Geladen" },
  { id: "cleaned",       label: "Gereinigt" },
  { id: "tubeless",      label: "Tubeless versiegelt" },
  { id: "bearing_check", label: "Lager geprüft" },
  { id: "other",         label: "Sonstiges" },
];

// Interval-Action-Types (inkl. "Tauschen" für Ersatz-Intervalle)
const INTERVAL_ACTION_TYPES = [
  { id: "replaced",      label: "Tauschen" },
  { id: "checked",       label: "Prüfen" },
  { id: "waxed",         label: "Wachsen" },
  { id: "lubricated",    label: "Ölen" },
  { id: "charged",       label: "Laden" },
  { id: "cleaned",       label: "Reinigen" },
  { id: "tubeless",      label: "Tubeless" },
  { id: "bearing_check", label: "Lager prüfen" },
];

const labelFor = (list, id) => list.find((x) => x.id === id)?.label ?? id;

async function post(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function patch(url, body) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiPatch(url, body) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function put(url, body) {
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------------------
// Kleines Modal für Aktions-Buttons (Geprüft / Gewartet / Getauscht)
// ---------------------------------------------------------------------------
function ActionModal({ component, bike, bikeKm, onClose, onDone }) {
  const { data: inventoryData } = useApi("/api/maintenance/inventory");
  const inventory = Array.isArray(inventoryData) ? inventoryData : [];
  const [tab, setTab] = useState("maintain"); // maintain | replace
  const [maintenanceType, setMaintenanceType] = useState("checked");
  const [note, setNote] = useState("");
  const [km, setKm] = useState(bikeKm ?? "");
  const [selectedInventoryId, setSelectedInventoryId] = useState(null);
  const [saving, setSaving] = useState(false);

  const selectedItem = inventory.find((i) => i.id === selectedInventoryId);

  async function handleMaintain() {
    setSaving(true);
    await post("/api/maintenance/log", {
      bike_id: bike.id,
      component_id: component.id,
      action: "maintained",
      maintenance_type: maintenanceType,
      date: dayjs().format("YYYY-MM-DD"),
      bike_km: km ? parseInt(km) : null,
      note,
    });
    onDone();
  }

  async function handleReplace() {
    setSaving(true);
    const today = dayjs().format("YYYY-MM-DD");
    const kmVal = km ? parseInt(km) : null;
    const newBrand = selectedItem?.brand ?? component.brand;
    const newModel = selectedItem?.model ?? component.model;
    // Alte Komponente ausbauen
    await patch(`/api/maintenance/components/${component.id}/remove`, {
      removed_date: today,
      removed_km: kmVal,
    });
    // Neue Komponente einbauen
    const { id: newId } = await post("/api/maintenance/components", {
      bike_id: bike.id,
      type: component.type,
      brand: newBrand,
      model: newModel,
      installed_date: today,
      installed_km: kmVal,
    });
    // Log-Eintrag
    await post("/api/maintenance/log", {
      bike_id: bike.id,
      component_id: newId,
      action: "replaced",
      date: today,
      bike_km: kmVal,
      note,
    });
    // Inventar abziehen
    if (selectedItem) {
      await fetch(`/api/maintenance/inventory/${selectedItem.id}/use`, { method: "POST" });
    }
    onDone();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: "var(--surface-1)", borderRadius: 12, padding: 24,
        width: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          {labelFor(COMPONENT_TYPES, component.type)}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          {component.brand} {component.model}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["maintain", "Warten / Prüfen"], ["replace", "Tauschen"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 12, cursor: "pointer",
              background: tab === id ? "var(--accent)" : "var(--surface-2)",
              color: tab === id ? "#fff" : "var(--text-muted)",
              border: "1px solid var(--border)",
            }}>{label}</button>
          ))}
        </div>

        {tab === "maintain" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={maintenanceType} onChange={(e) => setMaintenanceType(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 13 }}>
              {ACTION_TYPES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
        )}

        {tab === "replace" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <InventoryPicker
              type={component.type}
              inventory={inventory}
              selectedId={selectedInventoryId}
              onSelect={setSelectedInventoryId}
            />
            {selectedItem && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Eingebaut: {[selectedItem.brand, selectedItem.model].filter(Boolean).join(" ")}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          <div>
            <input type="number" placeholder={`KM-Stand (${bikeKm ?? "?"})`} value={km}
              onChange={(e) => setKm(e.target.value)}
              max={bikeKm ?? undefined}
              style={{ padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", border: `1px solid ${bikeKm && parseInt(km) > bikeKm ? "var(--red)" : "var(--border)"}`, fontSize: 13, width: "100%" }} />
            {bikeKm && parseInt(km) > bikeKm && (
              <div style={{ fontSize: 11, color: "var(--red)", marginTop: 3 }}>
                KM-Stand kann nicht größer als Rad-KM ({bikeKm.toLocaleString("de-AT")} km) sein.
              </div>
            )}
          </div>
          <input placeholder="Notiz (optional)" value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 13 }} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 13, cursor: "pointer",
            background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)",
          }}>Abbrechen</button>
          <button onClick={tab === "maintain" ? handleMaintain : handleReplace} disabled={saving} style={{
            flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 13, cursor: "pointer",
            background: "var(--accent)", color: "#fff", border: "none", fontWeight: 600,
          }}>{saving ? "…" : tab === "maintain" ? "Speichern" : "Tauschen"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventar-Dropdown für einen bestimmten Typ
// ---------------------------------------------------------------------------
function InventoryPicker({ type, inventory, selectedId, onSelect }) {
  const items = (inventory || []).filter((i) => i.type === type && i.quantity > 0);
  if (!items.length) return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "6px 0" }}>
      Kein Lagerbestand für diesen Typ
    </div>
  );
  return (
    <select value={selectedId ?? ""} onChange={(e) => onSelect(e.target.value ? parseInt(e.target.value) : null)}
      style={{ padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 13 }}>
      <option value="">— Aus Lager wählen —</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {[i.brand, i.model].filter(Boolean).join(" ")} ({i.quantity}x)
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Neue Komponente hinzufügen
// ---------------------------------------------------------------------------
function AddComponentForm({ bike, bikeKm, onDone }) {
  const { data: inventoryData } = useApi("/api/maintenance/inventory");
  const inventory = Array.isArray(inventoryData) ? inventoryData : [];
  const [type, setType] = useState("chain");
  const [selectedInventoryId, setSelectedInventoryId] = useState(null);
  const [km, setKm] = useState(bikeKm ?? "");
  const [saving, setSaving] = useState(false);

  const selectedItem = inventory.find((i) => i.id === selectedInventoryId);

  async function handleSave() {
    if (!selectedItem) return;
    setSaving(true);
    await post("/api/maintenance/components", {
      bike_id: bike.id,
      type,
      brand: selectedItem.brand,
      model: selectedItem.model,
      installed_date: dayjs().format("YYYY-MM-DD"),
      installed_km: km ? parseInt(km) : null,
    });
    await fetch(`/api/maintenance/inventory/${selectedItem.id}/use`, { method: "POST" });
    setSelectedInventoryId(null);
    setSaving(false);
    onDone();
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
      <select value={type} onChange={(e) => { setType(e.target.value); setSelectedInventoryId(null); }} style={{
        padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)",
        color: "var(--text)", border: "1px solid var(--border)", fontSize: 13,
      }}>
        {COMPONENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <InventoryPicker type={type} inventory={inventory} selectedId={selectedInventoryId} onSelect={setSelectedInventoryId} />
      <input type="number" placeholder="KM-Stand" value={km} onChange={(e) => setKm(e.target.value)} style={{
        padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)",
        color: "var(--text)", border: "1px solid var(--border)", fontSize: 13, width: 100,
      }} />
      <button onClick={handleSave} disabled={saving || !selectedItem} style={{
        padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
        background: "var(--accent)", color: "#fff", border: "none", fontWeight: 600,
        opacity: !selectedItem ? 0.5 : 1,
      }}>{saving ? "…" : "+ Einbauen"}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Serviceintervalle konfigurieren
// ---------------------------------------------------------------------------
function IntervalsSection({ bike, onDone }) {
  const [reload, setReload] = useState(0);
  const { data: intervals } = useApi(`/api/maintenance/intervals/${bike.id}?_=${reload}`);
  const [newType, setNewType] = useState("chain");
  const [newAction, setNewAction] = useState("replaced");
  const [newKm, setNewKm] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!newKm) return;
    setSaving(true);
    await put("/api/maintenance/intervals", {
      bike_id: bike.id,
      component_type: newType,
      action_type: newAction,
      interval_km: parseInt(newKm),
    });
    setNewKm("");
    setSaving(false);
    setReload((r) => r + 1);
  }

  async function handleDelete(id) {
    await fetch(`/api/maintenance/intervals/${id}`, { method: "DELETE" });
    setReload((r) => r + 1);
  }

  const inp = {
    padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)",
    color: "var(--text)", border: "1px solid var(--border)", fontSize: 13,
  };

  return (
    <div>
      {(intervals || []).length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
          <thead>
            <tr style={{ color: "var(--text-muted)", fontSize: 11 }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Komponente</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Aktion</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Alle (km)</th>
              <th style={{ padding: "4px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {(intervals || []).map((iv) => (
              <tr key={iv.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 8px" }}>{labelFor(COMPONENT_TYPES, iv.component_type)}</td>
                <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>
                  {labelFor(INTERVAL_ACTION_TYPES, iv.action_type || "replaced")}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>
                  {iv.interval_km?.toLocaleString("de-AT")}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>
                  <button onClick={() => handleDelete(iv.id)} style={{
                    background: "none", border: "none", color: "var(--text-muted)",
                    cursor: "pointer", fontSize: 14, padding: "0 4px",
                  }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Neues Intervall hinzufügen */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <select value={newType} onChange={(e) => setNewType(e.target.value)} style={inp}>
          {COMPONENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select value={newAction} onChange={(e) => setNewAction(e.target.value)} style={inp}>
          {INTERVAL_ACTION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input type="number" placeholder="km" value={newKm}
          onChange={(e) => setNewKm(e.target.value)}
          style={{ ...inp, width: 90 }} />
        <button onClick={handleAdd} disabled={saving || !newKm} style={{
          padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
          background: "var(--accent)", color: "#fff", border: "none", fontWeight: 600,
          opacity: !newKm ? 0.5 : 1,
        }}>{saving ? "…" : "+ Hinzufügen"}</button>
      </div>

      <button onClick={onDone} style={{
        marginTop: 14, padding: "6px 16px", borderRadius: 6, fontSize: 13,
        background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer",
      }}>Schließen</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventar
// ---------------------------------------------------------------------------
function InventorySection() {
  const { data: items, } = useApi("/api/maintenance/inventory");
  const [type, setType] = useState("chain");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [qty, setQty] = useState(1);
  const [minQty, setMinQty] = useState(1);
  const [reload, setReload] = useState(0);
  const _ = useApi(`/api/maintenance/inventory?_=${reload}`); // force refresh
  const inventory = _.data ?? items;

  async function handleAdd() {
    await post("/api/maintenance/inventory", {
      type, brand, model,
      quantity: parseInt(qty),
      min_quantity: parseInt(minQty),
    });
    setBrand(""); setModel(""); setQty(1);
    setReload((r) => r + 1);
  }

  async function handleQty(id, quantity) {
    await patch(`/api/maintenance/inventory/${id}`, { quantity: parseInt(quantity) });
    setReload((r) => r + 1);
  }

  async function handleDelete(id) {
    await fetch(`/api/maintenance/inventory/${id}`, { method: "DELETE" });
    setReload((r) => r + 1);
  }

  const low = (inventory || []).filter((i) => i.quantity < i.min_quantity);

  return (
    <div>
      {low.length > 0 && (
        <div style={{
          marginBottom: 12, padding: "8px 14px", borderRadius: 8,
          background: "rgba(234,179,8,0.1)", border: "1px solid var(--yellow)",
          fontSize: 13, color: "var(--yellow)",
        }}>
          Nachbestellen: {low.map((i) => `${i.brand || ""} ${i.model || labelFor(COMPONENT_TYPES, i.type)}`.trim()).join(", ")}
        </div>
      )}

      {(inventory || []).length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
          <thead>
            <tr style={{ color: "var(--text-muted)", fontSize: 11 }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Teil</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Bestand</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Minimum</th>
              <th style={{ padding: "4px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => (
              <tr key={item.id} style={{
                borderTop: "1px solid var(--border)",
                background: item.quantity < item.min_quantity ? "rgba(234,179,8,0.05)" : undefined,
              }}>
                <td style={{ padding: "6px 8px" }}>
                  <span style={{ fontWeight: 600 }}>{item.brand} {item.model}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 6 }}>
                    {labelFor(COMPONENT_TYPES, item.type)}
                  </span>
                </td>
                <td style={{ textAlign: "right", padding: "6px 8px" }}>
                  <input type="number" defaultValue={item.quantity} min={0}
                    onBlur={(e) => handleQty(item.id, e.target.value)}
                    style={{
                      width: 60, padding: "3px 6px", borderRadius: 6, textAlign: "right",
                      background: "var(--surface-2)", color: item.quantity < item.min_quantity ? "var(--yellow)" : "var(--text)",
                      border: `1px solid ${item.quantity < item.min_quantity ? "var(--yellow)" : "var(--border)"}`,
                      fontSize: 13, fontWeight: 700,
                    }}
                  />
                </td>
                <td style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                  {item.min_quantity}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>
                  <button onClick={() => handleDelete(item.id)} style={{
                    background: "none", border: "none", color: "var(--text-muted)",
                    cursor: "pointer", fontSize: 14, padding: "0 4px",
                  }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{
          padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)",
          color: "var(--text)", border: "1px solid var(--border)", fontSize: 13,
        }}>
          {COMPONENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input placeholder="Marke" value={brand} onChange={(e) => setBrand(e.target.value)} style={{
          padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)",
          color: "var(--text)", border: "1px solid var(--border)", fontSize: 13, width: 100,
        }} />
        <input placeholder="Modell" value={model} onChange={(e) => setModel(e.target.value)} style={{
          padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)",
          color: "var(--text)", border: "1px solid var(--border)", fontSize: 13, width: 130,
        }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Bestand</label>
          <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} style={{
            padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)",
            color: "var(--text)", border: "1px solid var(--border)", fontSize: 13, width: 70,
          }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Minimum</label>
          <input type="number" min={0} value={minQty} onChange={(e) => setMinQty(e.target.value)} style={{
            padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)",
            color: "var(--text)", border: "1px solid var(--border)", fontSize: 13, width: 70,
          }} />
        </div>
        <button onClick={handleAdd} style={{
          padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
          background: "var(--accent)", color: "#fff", border: "none", fontWeight: 600,
        }}>+ Hinzufügen</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hauptseite
// ---------------------------------------------------------------------------
export default function MaintenancePage({ initialBikeId = null }) {
  const { data: athlete } = useApi("/api/athlete");
  const bikes = athlete?.bikes ?? [];
  const [selectedBikeId, setSelectedBikeId] = useState(initialBikeId);
  const [modal, setModal] = useState(null); // { component }
  const [showAddForm, setShowAddForm] = useState(false);
  const [showIntervals, setShowIntervals] = useState(false);
  const [reload, setReload] = useState(0);

  const bike = bikes.find((b) => b.id === selectedBikeId) ?? bikes[0];
  const bikeId = bike?.id;

  const { data: components } = useApi(bikeId ? `/api/maintenance/components/${bikeId}?_=${reload}` : null);
  const { data: log } = useApi(bikeId ? `/api/maintenance/log/${bikeId}?_=${reload}` : null);
  const { data: intervals } = useApi(bikeId ? `/api/maintenance/intervals/${bikeId}?_=${reload}` : null);
  const { data: allAlerts } = useApi(`/api/maintenance/alerts?_=${reload}`);

  const installed = (components || []).filter((c) => c.is_installed);
  const history   = (components || []).filter((c) => !c.is_installed);
  const [editing, setEditing] = useState(null); // { id, brand, model }

  // Serviceintervalle: pro component_type das kleinste interval_km (für Warnanzeige)
  const intervalMap = {};
  for (const iv of (intervals || [])) {
    const existing = intervalMap[iv.component_type];
    if (!existing || iv.interval_km < existing) intervalMap[iv.component_type] = iv.interval_km;
  }
  // Alerts für das aktuell gewählte Fahrrad
  const bikeAlerts = (allAlerts || []).filter((a) => a.bike_id === bikeId);

  const refresh = useCallback(() => {
    setModal(null);
    setShowAddForm(false);
    setReload((r) => r + 1);
  }, []);

  if (!bikes.length) return <div className="card loading">Lade Fahrräder…</div>;

  return (
    <>
      {/* Bike-Auswahl */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {bikes.map((b) => (
          <button key={b.id} onClick={() => setSelectedBikeId(b.id)} style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
            background: (b.id === bikeId) ? "var(--accent)" : "var(--surface-2)",
            color: (b.id === bikeId) ? "#fff" : "var(--text-muted)",
            border: "1px solid var(--border)", fontWeight: 600,
          }}>
            {b.name}
            <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 400 }}>
              {b.km.toLocaleString("de-AT")} km
            </span>
          </button>
        ))}
      </div>

      {/* Wartungswarnungen */}
      {bikeAlerts.length > 0 && (
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {bikeAlerts.map((a) => {
            const isReplacement = a.action_type === "replaced";
            const color = isReplacement ? "var(--red)" : "var(--yellow)";
            return (
              <div key={`${a.bike_id}-${a.type}-${a.action_type}`} style={{
                padding: "12px 16px", borderRadius: 10,
                background: isReplacement ? "rgba(239,68,68,0.08)" : "rgba(234,179,8,0.08)",
                border: `1px solid ${color}`,
                borderLeft: `4px solid ${color}`,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <span style={{ fontSize: 18 }}>{isReplacement ? "⚠" : "○"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color }}>
                    {isReplacement ? "Wechsel fällig" : "Wartung fällig"} – {a.label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {a.km_since.toLocaleString("de-AT")} km seit letzter Aktion · Intervall: {a.interval_km.toLocaleString("de-AT")} km
                    {isReplacement && <span style={{ color, fontWeight: 600 }}> · {a.overdue_km.toLocaleString("de-AT")} km überfällig</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Verbaute Komponenten */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Verbaute Komponenten</div>
          <button onClick={() => setShowAddForm((s) => !s)} style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
            background: showAddForm ? "var(--surface-2)" : "var(--accent)",
            color: showAddForm ? "var(--text-muted)" : "#fff",
            border: "1px solid var(--border)",
          }}>
            {showAddForm ? "Abbrechen" : "+ Komponente"}
          </button>
        </div>

        {showAddForm && (
          <AddComponentForm bike={bike} bikeKm={bike?.km} onDone={refresh} />
        )}

        {installed?.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: showAddForm ? 16 : 0 }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", fontSize: 11 }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Typ</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Teil</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Eingebaut</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>km / nächste Wartung</th>
                <th style={{ padding: "4px 8px" }}></th>
              </tr>
            </thead>
            <tbody>
              {installed.map((c) => {
                const kmSince = c.installed_km != null ? (bike?.km ?? 0) - c.installed_km : null;
                const currentBikeKm = bike?.km ?? 0;

                // Für jeden Interval dieses Typs: letzten passenden Log-Eintrag finden
                const componentIntervals = (intervals || []).filter((iv) => iv.component_type === c.type);
                const nextDues = componentIntervals.map((iv) => {
                  const lastEntry = (log || [])
                    .filter((l) => {
                      if (l.component_type !== c.type) return false;
                      if (iv.action_type === "replaced") return l.action === "replaced";
                      return l.action === "replaced" || (l.action === "maintained" && l.maintenance_type === iv.action_type);
                    })
                    .sort((a, b) => (b.bike_km ?? 0) - (a.bike_km ?? 0))[0];
                  const lastKm = lastEntry?.bike_km ?? c.installed_km ?? 0;
                  const nextDueKm = lastKm + iv.interval_km;
                  const kmLeft = nextDueKm - currentBikeKm;
                  return { action_type: iv.action_type, kmLeft, nextDueKm };
                }).sort((a, b) => a.kmLeft - b.kmLeft); // dringlichstes zuerst

                // Warnfarbe aus aktiven Alerts ableiten
                const activeAlerts = bikeAlerts.filter((a) => a.type === c.type);
                const hasReplacement = activeAlerts.some((a) => a.action_type === "replaced");
                const hasMaintenance = activeAlerts.length > 0 && !hasReplacement;
                const statusColor = hasReplacement ? "var(--red)" : hasMaintenance ? "var(--yellow)" : "var(--accent)";

                return (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                      {labelFor(COMPONENT_TYPES, c.type)}
                    </td>
                    <td style={{ padding: "7px 8px", fontWeight: 600 }}>
                      {editing?.id === c.id ? (
                        <span style={{ display: "flex", gap: 4 }}>
                          <input defaultValue={c.brand} onChange={(e) => setEditing((ed) => ({ ...ed, brand: e.target.value }))}
                            style={{ width: 80, padding: "2px 6px", borderRadius: 4, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--accent)", fontSize: 13 }} />
                          <input defaultValue={c.model} onChange={(e) => setEditing((ed) => ({ ...ed, model: e.target.value }))}
                            style={{ width: 110, padding: "2px 6px", borderRadius: 4, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--accent)", fontSize: 13 }} />
                          <button onClick={async () => { await apiPatch(`/api/maintenance/components/${c.id}`, { brand: editing.brand ?? c.brand, model: editing.model ?? c.model }); setEditing(null); refresh(); }}
                            style={{ padding: "2px 8px", borderRadius: 4, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12 }}>✓</button>
                          <button onClick={() => setEditing(null)}
                            style={{ padding: "2px 6px", borderRadius: 4, background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }}>✕</button>
                        </span>
                      ) : (
                        <span>
                          {c.brand} {c.model}
                          <button onClick={() => setEditing({ id: c.id, brand: c.brand, model: c.model })}
                            style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12, opacity: 0.6 }}>✎</button>
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", padding: "7px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                      {c.installed_date ? dayjs(c.installed_date).format("DD.MM.YY") : "—"}
                      {c.installed_km != null && <span style={{ marginLeft: 6 }}>({c.installed_km.toLocaleString("de-AT")} km)</span>}
                    </td>
                    <td style={{ textAlign: "right", padding: "7px 8px" }}>
                      {/* km seit Einbau */}
                      <div style={{ fontWeight: 600, color: statusColor, fontSize: 13 }}>
                        {kmSince != null ? `${kmSince.toLocaleString("de-AT")} km` : "—"}
                      </div>
                      {/* nächste fällige Wartungen */}
                      {nextDues.map((nd) => {
                        const overdue = nd.kmLeft <= 0;
                        const color = overdue
                          ? "var(--red)"
                          : nd.kmLeft < nd.nextDueKm * 0.1
                          ? "var(--yellow)"
                          : "var(--text-muted)";
                        return (
                          <div key={nd.action_type} style={{ fontSize: 10, color, marginTop: 1 }}>
                            {overdue
                              ? `${labelFor(INTERVAL_ACTION_TYPES, nd.action_type)} fällig!`
                              : `noch ${nd.kmLeft.toLocaleString("de-AT")} km bis ${labelFor(INTERVAL_ACTION_TYPES, nd.action_type)}`}
                          </div>
                        );
                      })}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button onClick={() => setModal({ component: c })} style={{
                          padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                          background: "var(--surface-2)", color: "var(--text-muted)",
                          border: "1px solid var(--border)",
                        }}>Aktion</button>
                        <button onClick={async () => {
                          if (!confirm(`Komponente "${labelFor(COMPONENT_TYPES, c.type)}" wirklich löschen?`)) return;
                          await fetch(`/api/maintenance/components/${c.id}`, { method: "DELETE" });
                          refresh();
                        }} style={{
                          padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                          background: "none", color: "var(--text-muted)", border: "1px solid var(--border)",
                        }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12 }}>
            Noch keine Komponenten eingetragen.
          </div>
        )}
      </div>

      {/* Serviceintervalle */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Serviceintervalle</div>
          <button onClick={() => setShowIntervals((s) => !s)} style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
            background: "var(--surface-2)", color: "var(--text-muted)",
            border: "1px solid var(--border)",
          }}>
            {showIntervals ? "Schließen" : "Bearbeiten"}
          </button>
        </div>
        {showIntervals && <IntervalsSection bike={bike} onDone={() => { setShowIntervals(false); setReload((r) => r + 1); }} />}
        {!showIntervals && (
          intervals?.length > 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {intervals.map((iv) => (
                <div key={iv.id} style={{
                  background: "var(--surface-2)", borderRadius: 8, padding: "6px 12px",
                  fontSize: 12,
                }}>
                  <span style={{ color: "var(--text-muted)" }}>{labelFor(COMPONENT_TYPES, iv.component_type)} – {labelFor(INTERVAL_ACTION_TYPES, iv.action_type || "replaced")}: </span>
                  <strong>{iv.interval_km?.toLocaleString("de-AT")} km</strong>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Lege km-Intervalle fest, ab wann eine Wartungswarnung erscheint.
            </div>
          )
        )}
      </div>

      {/* Wartungslog */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Wartungslog</div>
        {log?.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", fontSize: 11 }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Datum</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Aktion</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Teil</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>KM-Stand</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Notiz</th>
                <th style={{ padding: "4px 8px" }}></th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px", color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                    {dayjs(entry.date).format("DD.MM.YY")}
                  </td>
                  <td style={{ padding: "6px 8px", fontWeight: 600, color: entry.action === "replaced" ? "var(--accent)" : "var(--text)" }}>
                    {entry.action === "replaced"
                      ? "Getauscht"
                      : labelFor(ACTION_TYPES, entry.maintenance_type)}
                  </td>
                  <td style={{ padding: "6px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                    {labelFor(COMPONENT_TYPES, entry.component_type)}
                    {(entry.brand || entry.model) && <span style={{ marginLeft: 4 }}>{entry.brand} {entry.model}</span>}
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                    {entry.bike_km != null ? `${entry.bike_km.toLocaleString("de-AT")} km` : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                    {entry.note || "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <button onClick={async () => {
                      await fetch(`/api/maintenance/log/${entry.id}`, { method: "DELETE" });
                      refresh();
                    }} style={{
                      background: "none", border: "none", color: "var(--text-muted)",
                      cursor: "pointer", fontSize: 13, padding: "0 4px", opacity: 0.5,
                    }} title="Eintrag löschen">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Noch keine Einträge.</div>
        )}
      </div>

      {/* Ausgebaute Teile / Historie */}
      {history?.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Teile-Historie</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", fontSize: 11 }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Typ</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Teil</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Eingebaut bei</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Ausgebaut bei</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Gelaufen</th>
              </tr>
            </thead>
            <tbody>
              {history.map((c) => {
                const kmRun = (c.installed_km != null && c.removed_km != null)
                  ? c.removed_km - c.installed_km : null;
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                      {labelFor(COMPONENT_TYPES, c.type)}
                    </td>
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{c.brand} {c.model}</td>
                    <td style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                      {c.installed_km?.toLocaleString("de-AT") ?? "—"} km
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                      {c.removed_km?.toLocaleString("de-AT") ?? "—"} km
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>
                      {kmRun != null ? `${kmRun.toLocaleString("de-AT")} km` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Inventar */}
      <div className="card">
        <div className="card-title">Ersatzteile-Inventar</div>
        <InventorySection />
      </div>

      {/* Aktions-Modal */}
      {modal && (
        <ActionModal
          component={modal.component}
          bike={bike}
          bikeKm={bike?.km}
          onClose={() => setModal(null)}
          onDone={refresh}
        />
      )}
    </>
  );
}
