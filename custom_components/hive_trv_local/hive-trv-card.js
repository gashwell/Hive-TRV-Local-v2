/**
 * Hive TRV Card — Home Assistant Lovelace custom card
 * Works with individual Z2M TRV climate entities and Hive TRV Local room groups.
 *
 * Install via HACS (Frontend) or manually:
 *   Copy to /config/www/hive-trv-card.js
 *   Resources → Add → /local/hive-trv-card.js → JavaScript Module
 *
 * Card config example:
 *   type: custom:hive-trv-card
 *   entity: climate.living_room_trv
 *   name: Living Room
 *   battery_entity: sensor.living_room_trv_battery
 *   demand_entity: sensor.living_room_trv_heating_demand
 *   orientation_entity: select.living_room_trv_mounting_orientation
 *   members:                       # optional — for group view
 *     - entity: climate.trv_1
 *       name: Radiator by window
 *     - entity: climate.trv_2
 *       name: Radiator by door
 */

const CARD_VERSION = "1.1.0";

const COLORS = {
  heating:  "#f97316",
  boost:    "#dc2626",
  schedule: "#7c3aed",
  idle:     "#3b82f6",
  off:      "#6b7280",
};

const STYLES = `
  :host { display: block; }
  .card { background: var(--card-background-color, #fff); border-radius: 14px; overflow: hidden; box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,.1)); font-family: var(--primary-font-family, sans-serif); }
  .header { padding: 16px 20px 12px; transition: background 0.3s; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .room-name { font-size: 13px; color: rgba(255,255,255,0.8); margin-bottom: 2px; }
  .status { display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(255,255,255,0.9); }
  .current-temp .label { font-size: 12px; color: rgba(255,255,255,0.7); text-align: right; }
  .current-temp .value { font-size: 30px; font-weight: 500; color: #fff; line-height: 1; text-align: right; }
  .target-row { display: flex; align-items: center; justify-content: center; gap: 20px; border-top: 0.5px solid rgba(255,255,255,0.2); padding-top: 14px; }
  .adj-btn { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2); border: none; color: #fff; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; transition: background 0.15s; }
  .adj-btn:hover { background: rgba(255,255,255,0.3); }
  .target-display .label { font-size: 12px; color: rgba(255,255,255,0.7); text-align: center; }
  .target-display .value { font-size: 38px; font-weight: 500; color: #fff; line-height: 1; text-align: center; }
  .modes { display: flex; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--divider-color, #eee); }
  .mode-btn { flex: 1; padding: 8px 4px; border-radius: 8px; border: 1px solid var(--divider-color, #eee); font-size: 11px; cursor: pointer; background: transparent; color: var(--secondary-text-color, #888); transition: all 0.15s; text-align: center; }
  .mode-btn.active { background: var(--secondary-background-color, #f5f5f5); color: var(--primary-text-color, #333); font-weight: 500; }
  .mode-icon { font-size: 16px; display: block; margin-bottom: 2px; }
  .panel { padding: 12px 14px; background: var(--secondary-background-color, #f5f5f5); border-bottom: 1px solid var(--divider-color, #eee); }
  .panel-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .panel-title { font-size: 13px; font-weight: 500; color: var(--primary-text-color, #333); }
  .boost-remaining { font-size: 12px; color: #f97316; font-weight: 500; }
  .slider-row { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  .slider-label { font-size: 12px; color: var(--secondary-text-color, #888); min-width: 68px; }
  .slider-row input[type=range] { flex: 1; }
  .slider-val { font-size: 13px; font-weight: 500; min-width: 42px; text-align: right; color: var(--primary-text-color, #333); }
  .panel-btn { width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color, #eee); background: transparent; color: var(--secondary-text-color, #888); font-size: 13px; cursor: pointer; margin-top: 8px; }
  .sched-slot { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-radius: 6px; margin-bottom: 4px; font-size: 13px; }
  .sched-slot.active { background: rgba(249,115,22,0.1); border: 1px solid #f97316; }
  .sched-slot.inactive { border: 1px solid var(--divider-color, #eee); }
  .now-badge { font-size: 10px; color: #f97316; background: rgba(249,115,22,0.12); padding: 1px 5px; border-radius: 4px; margin-left: 4px; }
  .stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 12px 14px; }
  .stat { background: var(--secondary-background-color, #f5f5f5); border-radius: 8px; padding: 8px 10px; }
  .stat-label { font-size: 11px; color: var(--secondary-text-color, #888); margin-bottom: 5px; }
  .bar-row { display: flex; align-items: center; gap: 5px; }
  .bar-track { flex: 1; height: 6px; background: var(--divider-color, #ddd); border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .bar-val { font-size: 12px; font-weight: 500; min-width: 30px; color: var(--primary-text-color, #333); }
  .signal-bars { display: flex; align-items: flex-end; gap: 2px; height: 18px; margin-top: 1px; }
  .signal-bar { width: 4px; border-radius: 1px; }
  .orientation-section { padding: 0 14px 12px; }
  .section-title { font-size: 12px; color: var(--secondary-text-color, #888); margin-bottom: 7px; }
  .orient-btns { display: flex; gap: 6px; }
  .orient-btn { flex: 1; padding: 8px 6px; border-radius: 8px; border: 1px solid var(--divider-color, #eee); background: transparent; color: var(--secondary-text-color, #888); font-size: 12px; cursor: pointer; text-align: center; transition: all 0.15s; }
  .orient-btn.active { border-color: #f97316; color: #f97316; background: rgba(249,115,22,0.08); font-weight: 500; }
  .orient-icon { font-size: 18px; display: block; margin-bottom: 3px; }
  .members { padding: 0 14px 12px; }
  .members-title { font-size: 12px; color: var(--secondary-text-color, #888); margin-bottom: 6px; }
  .member { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--secondary-background-color, #f5f5f5); border-radius: 6px; margin-bottom: 4px; }
  .member-name { font-size: 12px; color: var(--secondary-text-color, #888); }
  .member-temp { font-size: 13px; font-weight: 500; color: var(--primary-text-color, #333); }
  .actions { display: flex; gap: 8px; padding: 0 14px 14px; flex-wrap: wrap; }
  .action-btn { flex: 1; min-width: 100px; padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color, #eee); background: transparent; color: var(--secondary-text-color, #888); font-size: 12px; cursor: pointer; }
  .action-btn.active { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,0.08); }
  .divider { height: 1px; background: var(--divider-color, #eee); margin: 0 14px; }
`;

class HiveTRVCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._boostInterval = null;
    this._boostSeconds  = 0;
    this._localMode     = null;
    this._localTarget   = null;
    this._windowOpen    = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config.entity) throw new Error("entity required");
    this._config = config;
  }

  getCardSize() { return 6; }

  _state() {
    return this._hass?.states[this._config.entity] || null;
  }

  _attr(key) {
    return this._state()?.attributes[key] ?? null;
  }

  _mode() {
    return this._localMode || this._state()?.state || "off";
  }

  _target() {
    if (this._localTarget !== null) return this._localTarget;
    return this._attr("temperature") || 20;
  }

  _currentTemp() {
    const members = this._config.members;
    if (members?.length) {
      const temps = members
        .map(m => this._hass.states[m.entity]?.attributes?.current_temperature)
        .filter(t => t != null);
      if (temps.length) return (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
    }
    return (this._attr("current_temperature") ?? "—");
  }

  _orientation() {
    if (this._config.orientation_entity) {
      return this._hass.states[this._config.orientation_entity]?.state || "auto";
    }
    return this._attr("thermostat_orientation") || "auto";
  }

  _render() {
    const shadow = this.shadowRoot;
    if (!shadow.querySelector("style")) {
      const s = document.createElement("style");
      s.textContent = STYLES;
      shadow.appendChild(s);
      shadow.appendChild(document.createElement("div"));
    }

    const mode      = this._mode();
    const target    = parseFloat(this._target()).toFixed(1);
    const currentT  = this._currentTemp();
    const name      = this._config.name || this._attr("friendly_name") || this._config.entity;
    const isGroup   = !!(this._config.members?.length);
    const orient    = this._orientation();

    const battery   = this._config.battery_entity
      ? parseInt(this._hass.states[this._config.battery_entity]?.state || 0)
      : (this._attr("battery") ?? null);

    const demand = this._config.demand_entity
      ? parseInt(this._hass.states[this._config.demand_entity]?.state || 0)
      : (this._attr("pi_heating_demand") || 0);

    const isHeating  = this._attr("hvac_action") === "heating";
    const color      = mode === "boost"    ? COLORS.boost
                     : mode === "off"      ? COLORS.off
                     : mode === "schedule" ? COLORS.schedule
                     : isHeating           ? COLORS.heating : COLORS.idle;

    const statusIcon = mode === "boost"    ? "🚀"
                     : mode === "off"      ? "⏻"
                     : mode === "schedule" ? "📅"
                     : isHeating           ? "🔥" : "💧";

    const statusText = mode === "boost"    ? "Boosting"
                     : mode === "off"      ? "Off"
                     : mode === "schedule" ? "Schedule"
                     : isHeating           ? "Heating" : "Idle";

    const battBar   = battery ?? 0;
    const battColor = battBar > 30 ? "#22c55e" : battBar > 15 ? "#f97316" : "#ef4444";

    const memberRows = isGroup ? (this._config.members || []).map(m => {
      const ms   = this._hass.states[m.entity];
      const temp = ms?.attributes?.current_temperature?.toFixed(1) ?? "—";
      const mn   = m.name || ms?.attributes?.friendly_name || m.entity;
      return `<div class="member"><span class="member-name">${mn}</span><span class="member-temp">${temp} °C</span></div>`;
    }).join("") : "";

    const schedSlots  = this._attr("schedule") || [];
    const schedHtml   = schedSlots.length
      ? schedSlots.map((s, i) => {
          const active = i === (this._attr("schedule_current_slot") || 0);
          return `<div class="sched-slot ${active ? "active" : "inactive"}">
            <span style="color:var(--primary-text-color)">${s.time}</span>
            <span style="font-weight:${active ? 500 : 400};color:var(--primary-text-color)">
              ${parseFloat(s.temperature).toFixed(1)} °C
              ${active ? '<span class="now-badge">now</span>' : ""}
            </span>
          </div>`;
        }).join("")
      : `<div style="font-size:12px;color:var(--secondary-text-color);text-align:center;padding:8px 0">No schedule. Use hive_trv_local.set_schedule service.</div>`;

    const boostCd = this._boostSeconds > 0
      ? Math.floor(this._boostSeconds / 60) + ":" + String(this._boostSeconds % 60).padStart(2,"0") + " remaining"
      : this._attr("boost_remaining_minutes") != null
        ? this._attr("boost_remaining_minutes") + " min remaining"
        : "";

    // Orientation options — only shown for individual TRVs (not groups)
    const orientSection = isGroup ? "" : `
      <div class="divider"></div>
      <div class="orientation-section" style="padding-top:12px">
        <div class="section-title">Valve mounting orientation</div>
        <div class="orient-btns">
          ${[
            {val:"auto",       icon:"🔄", label:"Auto"},
            {val:"horizontal", icon:"↔",  label:"Horizontal"},
            {val:"vertical",   icon:"↕",  label:"Vertical"},
          ].map(o => `
            <button class="orient-btn ${orient === o.val ? "active" : ""}" data-orient="${o.val}">
              <span class="orient-icon">${o.icon}</span>${o.label}
            </button>`).join("")}
        </div>
        <div style="font-size:11px;color:var(--secondary-text-color);margin-top:6px">
          Set to match your radiator pipe direction for accurate valve control.
        </div>
      </div>`;

    shadow.children[1].innerHTML = `
      <div class="card">

        <div class="header" style="background:${color}">
          <div class="header-top">
            <div>
              <div class="room-name">${name}${isGroup ? " (group)" : ""}</div>
              <div class="status"><span>${statusIcon}</span><span>${statusText}</span></div>
            </div>
            <div class="current-temp">
              <div class="label">Current</div>
              <div class="value">${currentT}°</div>
            </div>
          </div>
          <div class="target-row">
            <button class="adj-btn" id="minus-btn">−</button>
            <div class="target-display">
              <div class="label">Target</div>
              <div class="value" id="target-val">${target}°</div>
            </div>
            <button class="adj-btn" id="plus-btn">+</button>
          </div>
        </div>

        <div class="modes">
          ${[
            {m:"manual",   i:"🌡", l:"Manual"},
            {m:"schedule", i:"📅", l:"Schedule"},
            {m:"boost",    i:"🚀", l:"Boost"},
            {m:"off",      i:"⏻", l:"Off"},
          ].map(({m,i,l}) => `
            <button class="mode-btn ${mode===m?"active":""}" data-mode="${m}">
              <span class="mode-icon">${i}</span>${l}
            </button>`).join("")}
        </div>

        ${mode === "boost" ? `
        <div class="panel">
          <div class="panel-row">
            <span class="panel-title">Boost settings</span>
            <span class="boost-remaining" id="boost-cd">${boostCd}</span>
          </div>
          <div class="slider-row">
            <span class="slider-label">Temperature</span>
            <input type="range" min="5" max="32" step="0.5" value="${this._attr("boost_temperature") || 22}" id="boost-temp">
            <span class="slider-val" id="bt-val">${parseFloat(this._attr("boost_temperature") || 22).toFixed(1)}°</span>
          </div>
          <div class="slider-row">
            <span class="slider-label">Duration</span>
            <input type="range" min="5" max="120" step="5" value="${this._attr("boost_duration") || 30}" id="boost-dur">
            <span class="slider-val" id="bd-val">${this._attr("boost_duration") || 30} min</span>
          </div>
          <button class="panel-btn" id="end-boost-btn">End boost</button>
        </div>` : ""}

        ${mode === "schedule" ? `
        <div class="panel">
          <div class="panel-row"><span class="panel-title">Today's schedule</span></div>
          ${schedHtml}
          <button class="panel-btn" id="adv-btn">Skip to next slot</button>
        </div>` : ""}

        <div class="stats">
          ${battery != null ? `
          <div class="stat">
            <div class="stat-label">Battery</div>
            <div class="bar-row">
              <div class="bar-track"><div class="bar-fill" style="width:${battBar}%;background:${battColor}"></div></div>
              <span class="bar-val">${battBar}%</span>
            </div>
          </div>` : ""}
          <div class="stat">
            <div class="stat-label">Demand</div>
            <div class="bar-row">
              <div class="bar-track"><div class="bar-fill" style="width:${demand}%;background:#f97316"></div></div>
              <span class="bar-val">${demand}%</span>
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">Signal</div>
            <div class="signal-bars">
              ${[6,10,14,18].map((h,i) => `<div class="signal-bar" style="height:${h}px;background:${i<3?"#22c55e":"var(--divider-color,#ddd)"}"></div>`).join("")}
            </div>
          </div>
        </div>

        ${isGroup && memberRows ? `
        <div class="divider"></div>
        <div class="members" style="padding-top:12px">
          <div class="members-title">Member temperatures</div>
          ${memberRows}
        </div>` : ""}

        ${orientSection}

        <div class="divider"></div>
        <div class="actions" style="padding-top:12px">
          <button class="action-btn ${this._windowOpen ? "active" : ""}" id="window-btn">
            🪟 ${this._windowOpen ? "Window open" : "Window closed"}
          </button>
          ${mode !== "off" ? `<button class="action-btn" id="frost-btn">❄ Frost protect</button>` : ""}
        </div>
      </div>`;

    this._bindEvents(shadow, mode);
  }

  _bindEvents(shadow, mode) {
    const eid  = this._config.entity;
    const call = (svc, data) => this._hass.callService("climate", svc, { entity_id: eid, ...data });

    shadow.getElementById("minus-btn")?.addEventListener("click", () => {
      this._localTarget = Math.max(5, parseFloat(this._target()) - 0.5);
      shadow.getElementById("target-val").textContent = this._localTarget.toFixed(1) + "°";
      call("set_temperature", { temperature: this._localTarget });
    });

    shadow.getElementById("plus-btn")?.addEventListener("click", () => {
      this._localTarget = Math.min(32, parseFloat(this._target()) + 0.5);
      shadow.getElementById("target-val").textContent = this._localTarget.toFixed(1) + "°";
      call("set_temperature", { temperature: this._localTarget });
    });

    shadow.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const m = btn.dataset.mode;
        this._localMode = m;
        if (m === "off") {
          call("set_hvac_mode", { hvac_mode: "off" });
        } else if (m === "boost") {
          this._hass.callService("hive_trv_local", "boost", { entity_id: eid }).catch(() => {
            this._hass.callService("hive_local_trv", "boost", { entity_id: eid }).catch(() => {});
          });
          this._startBoostTimer(1800);
        } else {
          call("set_hvac_mode", { hvac_mode: "heat" });
          call("set_preset_mode", { preset_mode: m });
          if (m === "schedule") {
            this._hass.callService("hive_trv_local", "advance_schedule", { entity_id: eid }).catch(() =>
              this._hass.callService("hive_local_trv", "advance_schedule", { entity_id: eid }).catch(() => {}));
          }
        }
        this._render();
      });
    });

    shadow.getElementById("end-boost-btn")?.addEventListener("click", () => {
      this._hass.callService("hive_trv_local", "end_boost", { entity_id: eid }).catch(() =>
        this._hass.callService("hive_local_trv", "end_boost", { entity_id: eid }).catch(() => {}));
      this._localMode = "manual";
      if (this._boostInterval) clearInterval(this._boostInterval);
      this._render();
    });

    shadow.getElementById("adv-btn")?.addEventListener("click", () => {
      this._hass.callService("hive_trv_local", "advance_schedule", { entity_id: eid }).catch(() =>
        this._hass.callService("hive_local_trv", "advance_schedule", { entity_id: eid }).catch(() => {}));
    });

    shadow.getElementById("boost-temp")?.addEventListener("input", e => {
      shadow.getElementById("bt-val").textContent = parseFloat(e.target.value).toFixed(1) + "°";
    });

    shadow.getElementById("boost-dur")?.addEventListener("input", e => {
      shadow.getElementById("bd-val").textContent = parseInt(e.target.value) + " min";
    });

    // Orientation buttons
    shadow.querySelectorAll(".orient-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const o = btn.dataset.orient;
        if (this._config.orientation_entity) {
          this._hass.callService("select", "select_option", {
            entity_id: this._config.orientation_entity,
            option: o,
          });
        } else {
          // Fall back to MQTT publish if no select entity configured
          const fname = this._attr("friendly_name") || eid;
          const topic = `zigbee2mqtt/${fname}/set`;
          this._hass.callService("mqtt", "publish", {
            topic, payload: JSON.stringify({ thermostat_orientation: o })
          }).catch(() => {});
        }
        this._render();
      });
    });

    shadow.getElementById("window-btn")?.addEventListener("click", () => {
      this._windowOpen = !this._windowOpen;
      const fname = this._attr("friendly_name") || eid;
      this._hass.callService("mqtt", "publish", {
        topic: `zigbee2mqtt/${fname}/set`,
        payload: JSON.stringify({ window_open_external: this._windowOpen })
      }).catch(() => {});
      this._render();
    });

    shadow.getElementById("frost-btn")?.addEventListener("click", () => {
      call("set_temperature", { temperature: 7 });
    });
  }

  _startBoostTimer(seconds) {
    if (this._boostInterval) clearInterval(this._boostInterval);
    this._boostSeconds = seconds;
    this._boostInterval = setInterval(() => {
      this._boostSeconds = Math.max(0, this._boostSeconds - 1);
      const cd = this.shadowRoot.getElementById("boost-cd");
      if (cd) {
        cd.textContent = Math.floor(this._boostSeconds / 60) + ":" +
          String(this._boostSeconds % 60).padStart(2, "0") + " remaining";
      }
      if (this._boostSeconds === 0) {
        clearInterval(this._boostInterval);
        this._localMode = "manual";
        this._render();
      }
    }, 1000);
  }

  disconnectedCallback() {
    if (this._boostInterval) clearInterval(this._boostInterval);
  }
}

customElements.define("hive-trv-card", HiveTRVCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "hive-trv-card",
  name:        "Hive TRV Card",
  description: `v${CARD_VERSION} — Hive-style thermostat card for Z2M TRVs and Hive TRV Local room groups`,
  preview:     true,
});

console.info(`%c HIVE-TRV-CARD %c v${CARD_VERSION} `, "color:#f97316;font-weight:700;background:#000;padding:2px 4px;border-radius:4px 0 0 4px", "background:#f97316;color:#fff;padding:2px 4px;border-radius:0 4px 4px 0");
