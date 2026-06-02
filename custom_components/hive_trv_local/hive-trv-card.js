/**
 * Hive TRV Card — Home Assistant Lovelace custom card
 * Bundled with Hive TRV Local v2 — auto-registered on integration install.
 *
 * Works with:
 *   - Individual Hive/Danfoss Z2M TRV climate entities (via MQTT integration)
 *   - Hive TRV Local v2 room group climate entities
 *
 * Card config:
 *   type: custom:hive-trv-card
 *   entity: climate.living_room_trv        # TRV or room group entity
 *   name: Living Room                       # optional name override
 *   battery_entity: sensor.trv_battery     # optional
 *   demand_entity: sensor.trv_demand       # optional
 *   orientation_entity: select.trv_orientation # optional (v1 select entity)
 *   members:                               # optional — group member temps
 *     - entity: climate.trv_1
 *       name: Radiator by window
 */

const CARD_VERSION = "1.2.0";

const COLORS = {
  heating:  "#f97316",
  boost:    "#dc2626",
  schedule: "#7c3aed",
  idle:     "#3b82f6",
  off:      "#6b7280",
};

const STYLES = `
  :host { display: block; }
  * { box-sizing: border-box; }
  .card { background: var(--card-background-color, #fff); border-radius: 14px; overflow: hidden; box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,.1)); font-family: var(--primary-font-family, sans-serif); }
  .header { padding: 16px 20px 14px; transition: background 0.3s; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .room-name { font-size: 13px; color: rgba(255,255,255,0.8); margin-bottom: 3px; }
  .status { display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(255,255,255,0.9); }
  .cur-temp { text-align: right; }
  .cur-temp .lbl { font-size: 11px; color: rgba(255,255,255,0.7); }
  .cur-temp .val { font-size: 30px; font-weight: 500; color: #fff; line-height: 1; }
  .target-row { display: flex; align-items: center; justify-content: center; gap: 20px; border-top: 0.5px solid rgba(255,255,255,0.2); padding-top: 14px; }
  .adj { width: 42px; height: 42px; border-radius: 50%; background: rgba(255,255,255,0.2); border: none; color: #fff; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
  .adj:hover { background: rgba(255,255,255,0.35); }
  .tgt .lbl { font-size: 11px; color: rgba(255,255,255,0.7); text-align: center; }
  .tgt .val { font-size: 38px; font-weight: 500; color: #fff; line-height: 1; text-align: center; min-width: 100px; }
  .modes { display: flex; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--divider-color, #eee); }
  .mbtn { flex: 1; padding: 8px 4px; border-radius: 8px; border: 1px solid var(--divider-color, #eee); font-size: 11px; cursor: pointer; background: transparent; color: var(--secondary-text-color, #888); transition: all 0.15s; text-align: center; line-height: 1.3; }
  .mbtn.on { background: var(--secondary-background-color, #f5f5f5); color: var(--primary-text-color, #333); font-weight: 600; border-color: var(--primary-text-color, #ccc); }
  .mi { font-size: 17px; display: block; margin-bottom: 3px; }
  .panel { padding: 12px 14px; background: var(--secondary-background-color, #f5f5f5); border-bottom: 1px solid var(--divider-color, #eee); }
  .prow { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .ptitle { font-size: 13px; font-weight: 500; color: var(--primary-text-color, #333); }
  .countdown { font-size: 12px; color: #f97316; font-weight: 600; }
  .srow { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  .slbl { font-size: 12px; color: var(--secondary-text-color, #888); min-width: 72px; }
  .srow input[type=range] { flex: 1; accent-color: #f97316; }
  .sval { font-size: 13px; font-weight: 500; min-width: 44px; text-align: right; color: var(--primary-text-color, #333); }
  .pbtn { width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color, #eee); background: transparent; color: var(--secondary-text-color, #888); font-size: 13px; cursor: pointer; margin-top: 6px; transition: background 0.15s; }
  .pbtn:hover { background: var(--divider-color, #eee); }
  .slot { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-radius: 6px; margin-bottom: 4px; font-size: 13px; border: 1px solid var(--divider-color, #eee); }
  .slot.cur { background: rgba(249,115,22,0.1); border-color: #f97316; }
  .now { font-size: 10px; background: rgba(249,115,22,0.15); color: #f97316; padding: 1px 5px; border-radius: 4px; margin-left: 5px; font-weight: 600; }
  .no-sched { font-size: 12px; color: var(--secondary-text-color); text-align: center; padding: 8px 0; }
  .stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 12px 14px; }
  .stat { background: var(--secondary-background-color, #f5f5f5); border-radius: 8px; padding: 8px 10px; }
  .slabel { font-size: 11px; color: var(--secondary-text-color, #888); margin-bottom: 5px; }
  .brow { display: flex; align-items: center; gap: 4px; }
  .btrack { flex: 1; height: 6px; background: var(--divider-color, #ddd); border-radius: 3px; overflow: hidden; }
  .bfill { height: 100%; border-radius: 3px; transition: width 0.4s; }
  .bval { font-size: 12px; font-weight: 500; min-width: 30px; color: var(--primary-text-color, #333); }
  .sigbars { display: flex; align-items: flex-end; gap: 2px; height: 18px; margin-top: 2px; }
  .sigbar { width: 4px; border-radius: 1px; }
  .divl { height: 1px; background: var(--divider-color, #eee); }
  .sect { padding: 12px 14px; }
  .stitle { font-size: 12px; color: var(--secondary-text-color, #888); margin-bottom: 7px; }
  .orient { display: flex; gap: 6px; }
  .obtn { flex: 1; padding: 8px 6px; border-radius: 8px; border: 1px solid var(--divider-color, #eee); background: transparent; color: var(--secondary-text-color, #888); font-size: 12px; cursor: pointer; text-align: center; transition: all 0.15s; }
  .obtn.on { border-color: #f97316; color: #f97316; background: rgba(249,115,22,0.08); font-weight: 600; }
  .oi { font-size: 18px; display: block; margin-bottom: 3px; }
  .ohint { font-size: 11px; color: var(--secondary-text-color); margin-top: 6px; }
  .members { padding: 0 14px 12px; }
  .member { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--secondary-background-color, #f5f5f5); border-radius: 6px; margin-bottom: 4px; }
  .mname { font-size: 12px; color: var(--secondary-text-color); }
  .mtemp { font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
  .actions { display: flex; gap: 8px; padding: 12px 14px; flex-wrap: wrap; }
  .abtn { flex: 1; min-width: 120px; padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color, #eee); background: transparent; color: var(--secondary-text-color); font-size: 12px; cursor: pointer; transition: all 0.15s; }
  .abtn.warn { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,0.06); }
`;

class HiveTRVCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._boostInterval = null;
    this._boostSecs     = 0;
    this._localMode     = null;
    this._localTarget   = null;
    this._windowOpen    = false;
  }

  static getConfigElement() {
    return document.createElement("hive-trv-card-editor");
  }

  static getStubConfig(hass) {
    // Suggest first room-group entity (hive_trv_local) or first climate entity
    const eids = Object.keys(hass.states);
    const group = eids.find(e => {
      const s = hass.states[e];
      return e.startsWith("climate.") && s?.attributes?.members;
    });
    const trv = eids.find(e => {
      const s = hass.states[e];
      return e.startsWith("climate.") &&
             (s?.attributes?.pi_heating_demand !== undefined ||
              s?.attributes?.battery !== undefined);
    });
    return { entity: group || trv || "climate.example" };
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(cfg) {
    if (!cfg.entity) throw new Error("entity is required");
    this._cfg = cfg;
  }

  getCardSize() { return 6; }

  // ── State helpers ──────────────────────────────────────────────────────────

  _st()        { return this._hass?.states[this._cfg.entity] || null; }
  _a(k)        { return this._st()?.attributes[k] ?? null; }
  _mode()      { return this._localMode || this._st()?.state || "off"; }
  _target()    { return this._localTarget ?? this._a("temperature") ?? 20; }

  _curTemp() {
    const mbrs = this._cfg.members;
    if (mbrs?.length) {
      const ts = mbrs.map(m => this._hass.states[m.entity]?.attributes?.current_temperature)
                     .filter(t => t != null);
      if (ts.length) return (ts.reduce((a,b)=>a+b,0)/ts.length).toFixed(1);
    }
    return (this._a("current_temperature") ?? "—");
  }

  _orient() {
    if (this._cfg.orientation_entity) {
      return this._hass.states[this._cfg.orientation_entity]?.state || "auto";
    }
    return this._a("thermostat_orientation") || "auto";
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  _render() {
    const sh = this.shadowRoot;
    if (!sh.querySelector("style")) {
      const s = document.createElement("style"); s.textContent = STYLES; sh.appendChild(s);
      sh.appendChild(document.createElement("div"));
    }

    const mode      = this._mode();
    const target    = parseFloat(this._target()).toFixed(1);
    const curT      = this._curTemp();
    const name      = this._cfg.name || this._a("friendly_name") || this._cfg.entity;
    const isGroup   = !!(this._cfg.members?.length || this._a("members")?.length);
    const orient    = this._orient();
    const isHeat    = this._a("hvac_action") === "heating";
    const demand    = this._cfg.demand_entity
                      ? parseInt(this._hass.states[this._cfg.demand_entity]?.state || 0)
                      : (this._a("pi_heating_demand") || 0);
    const battery   = this._cfg.battery_entity
                      ? parseInt(this._hass.states[this._cfg.battery_entity]?.state || 0)
                      : (this._a("battery") ?? null);

    const color   = mode==="boost"?"#dc2626":mode==="off"?"#6b7280":mode==="schedule"?"#7c3aed":isHeat?"#f97316":"#3b82f6";
    const sIcon   = mode==="boost"?"🚀":mode==="off"?"⏻":mode==="schedule"?"📅":isHeat?"🔥":"💧";
    const sTxt    = mode==="boost"?"Boosting":mode==="off"?"Off":mode==="schedule"?"Schedule":isHeat?"Heating":"Idle";

    const battBar   = battery ?? 0;
    const battColor = battBar>30?"#22c55e":battBar>15?"#f97316":"#ef4444";

    // Schedule
    const schedSlots = this._a("schedule") || [];
    const curSlotIdx = this._a("schedule_current_slot") || 0;
    const schedHtml  = schedSlots.length
      ? schedSlots.map((s,i)=>`
          <div class="slot ${i===curSlotIdx?"cur":""}">
            <span style="color:var(--primary-text-color)">${s.time}</span>
            <span style="font-weight:${i===curSlotIdx?600:400};color:var(--primary-text-color)">
              ${parseFloat(s.temperature).toFixed(1)} °C
              ${i===curSlotIdx?'<span class="now">now</span>':""}
            </span>
          </div>`).join("")
      : `<div class="no-sched">No schedule set.<br><small>Use hive_trv_local.set_schedule service or Configure → Set a heating schedule.</small></div>`;

    // Boost countdown
    const boostMins = this._a("boost_remaining_minutes");
    const cdText    = this._boostSecs > 0
                      ? `${Math.floor(this._boostSecs/60)}:${String(this._boostSecs%60).padStart(2,"0")} remaining`
                      : boostMins != null ? `${boostMins} min remaining` : "";

    // Group members
    const memberSrc  = this._cfg.members || (this._a("members") || []).map(e=>({entity:e}));
    const memberHtml = isGroup ? memberSrc.map(m => {
      const ms   = this._hass.states[m.entity];
      const temp = ms?.attributes?.current_temperature?.toFixed(1) ?? "—";
      const mn   = m.name || ms?.attributes?.friendly_name || m.entity;
      return `<div class="member"><span class="mname">${mn}</span><span class="mtemp">${temp} °C</span></div>`;
    }).join("") : "";

    const boostT = this._a("boost_temperature") || 22;
    const boostD = this._a("boost_duration")    || 30;

    sh.children[1].innerHTML = `
    <div class="card">

      <div class="header" style="background:${color}">
        <div class="header-top">
          <div>
            <div class="room-name">${name}${isGroup?" (group)":""}</div>
            <div class="status"><span>${sIcon}</span><span>${sTxt}</span></div>
          </div>
          <div class="cur-temp">
            <div class="lbl">Current</div>
            <div class="val">${curT}°</div>
          </div>
        </div>
        <div class="target-row">
          <button class="adj" id="minus">−</button>
          <div class="tgt">
            <div class="lbl">Target</div>
            <div class="val" id="tval">${target}°</div>
          </div>
          <button class="adj" id="plus">+</button>
        </div>
      </div>

      <div class="modes">
        ${[{m:"manual",i:"🌡",l:"Manual"},{m:"schedule",i:"📅",l:"Schedule"},{m:"boost",i:"🚀",l:"Boost"},{m:"off",i:"⏻",l:"Off"}]
          .map(({m,i,l})=>`<button class="mbtn${mode===m?" on":""}" data-mode="${m}"><span class="mi">${i}</span>${l}</button>`).join("")}
      </div>

      ${mode==="boost"?`
      <div class="panel">
        <div class="prow">
          <span class="ptitle">Boost settings</span>
          <span class="countdown" id="bcd">${cdText}</span>
        </div>
        <div class="srow">
          <span class="slbl">Temperature</span>
          <input type="range" min="5" max="32" step="0.5" value="${boostT}" id="btemp">
          <span class="sval" id="btval">${parseFloat(boostT).toFixed(1)}°</span>
        </div>
        <div class="srow">
          <span class="slbl">Duration</span>
          <input type="range" min="5" max="120" step="5" value="${boostD}" id="bdur">
          <span class="sval" id="bdval">${boostD} min</span>
        </div>
        <button class="pbtn" id="endboost">End boost</button>
      </div>`:mode==="schedule"?`
      <div class="panel">
        <div class="prow"><span class="ptitle">Today's schedule</span></div>
        ${schedHtml}
        <button class="pbtn" id="skip">Skip to next slot ↗</button>
      </div>`:""}

      <div class="stats">
        ${battery!=null?`
        <div class="stat">
          <div class="slabel">Battery</div>
          <div class="brow"><div class="btrack"><div class="bfill" style="width:${battBar}%;background:${battColor}"></div></div><span class="bval">${battBar}%</span></div>
        </div>`:""}
        <div class="stat">
          <div class="slabel">Demand</div>
          <div class="brow"><div class="btrack"><div class="bfill" style="width:${demand}%;background:#f97316"></div></div><span class="bval">${demand}%</span></div>
        </div>
        <div class="stat">
          <div class="slabel">Signal</div>
          <div class="sigbars">${[6,10,14,18].map((h,i)=>`<div class="sigbar" style="height:${h}px;background:${i<3?"#22c55e":"var(--divider-color,#ddd)"}"></div>`).join("")}</div>
        </div>
      </div>

      ${isGroup&&memberHtml?`<div class="divl"></div><div class="members" style="padding-top:12px"><div class="stitle">Member temperatures</div>${memberHtml}</div>`:""}

      ${!isGroup?`
      <div class="divl"></div>
      <div class="sect">
        <div class="stitle">Valve mounting orientation</div>
        <div class="orient">
          ${[{v:"auto",i:"🔄",l:"Auto"},{v:"horizontal",i:"↔",l:"Horizontal"},{v:"vertical",i:"↕",l:"Vertical"}]
            .map(o=>`<button class="obtn${orient===o.v?" on":""}" data-orient="${o.v}"><span class="oi">${o.i}</span>${o.l}</button>`).join("")}
        </div>
        <div class="ohint">Match your radiator pipe direction for accurate valve control.</div>
      </div>`:""}

      <div class="divl"></div>
      <div class="actions">
        <button class="abtn${this._windowOpen?" warn":""}" id="winbtn">🪟 ${this._windowOpen?"Window open":"Window closed"}</button>
        ${mode!=="off"?`<button class="abtn" id="frostbtn">❄ Frost protect (7°C)</button>`:""}
      </div>

    </div>`;

    this._bind();
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  _bind() {
    const sh  = this.shadowRoot;
    const eid = this._cfg.entity;
    const svc = (s, d) => this._hass.callService("climate", s, { entity_id: eid, ...d });
    const htl = (s, d) => {
      this._hass.callService("hive_trv_local", s, { entity_id: eid, ...d }).catch(() =>
        this._hass.callService("hive_local_trv", s, { entity_id: eid, ...d }).catch(() => {}));
    };

    sh.getElementById("minus")?.addEventListener("click", () => {
      this._localTarget = Math.max(5, parseFloat(this._target()) - 0.5);
      sh.getElementById("tval").textContent = this._localTarget.toFixed(1) + "°";
      svc("set_temperature", { temperature: this._localTarget });
    });

    sh.getElementById("plus")?.addEventListener("click", () => {
      this._localTarget = Math.min(32, parseFloat(this._target()) + 0.5);
      sh.getElementById("tval").textContent = this._localTarget.toFixed(1) + "°";
      svc("set_temperature", { temperature: this._localTarget });
    });

    sh.querySelectorAll(".mbtn").forEach(b => b.addEventListener("click", () => {
      const m = b.dataset.mode;
      this._localMode = m;
      if (m === "off") {
        svc("set_hvac_mode", { hvac_mode: "off" });
      } else if (m === "boost") {
        const bt = parseFloat(sh.getElementById("btemp")?.value || this._a("boost_temperature") || 22);
        const bd = parseInt(sh.getElementById("bdur")?.value || this._a("boost_duration") || 30);
        htl("boost", { temperature: bt, duration_minutes: bd });
        this._startTimer(bd * 60);
      } else {
        svc("set_hvac_mode", { hvac_mode: "heat" });
        svc("set_preset_mode", { preset_mode: m });
      }
      this._render();
    }));

    sh.getElementById("endboost")?.addEventListener("click", () => {
      htl("end_boost", {});
      this._localMode = "manual";
      if (this._boostInterval) clearInterval(this._boostInterval);
      this._render();
    });

    sh.getElementById("skip")?.addEventListener("click", () => htl("advance_schedule", {}));

    sh.getElementById("btemp")?.addEventListener("input", e => {
      sh.getElementById("btval").textContent = parseFloat(e.target.value).toFixed(1) + "°";
    });

    sh.getElementById("bdur")?.addEventListener("input", e => {
      sh.getElementById("bdval").textContent = parseInt(e.target.value) + " min";
    });

    sh.querySelectorAll(".obtn").forEach(b => b.addEventListener("click", () => {
      const o = b.dataset.orient;
      if (this._cfg.orientation_entity) {
        this._hass.callService("select", "select_option", {
          entity_id: this._cfg.orientation_entity, option: o
        });
      } else {
        const fname = this._a("friendly_name") || eid;
        this._hass.callService("mqtt", "publish", {
          topic:   `zigbee2mqtt/${fname}/set`,
          payload: JSON.stringify({ thermostat_orientation: o }),
        }).catch(() => {});
      }
    }));

    sh.getElementById("winbtn")?.addEventListener("click", () => {
      this._windowOpen = !this._windowOpen;
      const fname = this._a("friendly_name") || eid;
      this._hass.callService("mqtt", "publish", {
        topic:   `zigbee2mqtt/${fname}/set`,
        payload: JSON.stringify({ window_open_external: this._windowOpen }),
      }).catch(() => {});
      this._render();
    });

    sh.getElementById("frostbtn")?.addEventListener("click", () => {
      svc("set_temperature", { temperature: 7 });
    });
  }

  _startTimer(seconds) {
    if (this._boostInterval) clearInterval(this._boostInterval);
    this._boostSecs = seconds;
    this._boostInterval = setInterval(() => {
      this._boostSecs = Math.max(0, this._boostSecs - 1);
      const cd = this.shadowRoot.getElementById("bcd");
      if (cd) cd.textContent = `${Math.floor(this._boostSecs/60)}:${String(this._boostSecs%60).padStart(2,"0")} remaining`;
      if (this._boostSecs === 0) { clearInterval(this._boostInterval); this._localMode = "manual"; this._render(); }
    }, 1000);
  }

  disconnectedCallback() {
    if (this._boostInterval) clearInterval(this._boostInterval);
  }
}

customElements.define("hive-trv-card", HiveTRVCard);

window.customCards = window.customCards || [];
const existing = window.customCards.findIndex(c => c.type === "hive-trv-card");
if (existing >= 0) window.customCards.splice(existing, 1);
window.customCards.push({
  type:             "hive-trv-card",
  name:             "Hive TRV Card",
  description:      `v${CARD_VERSION} — Hive-style thermostat card for Z2M TRVs and Hive TRV Local room groups`,
  preview:          true,
  documentationURL: "https://github.com/gashwell/Hive-TRV-Local-v2",
});

console.info(
  `%c HIVE-TRV-CARD %c v${CARD_VERSION} `,
  "color:#f97316;font-weight:700;background:#000;padding:2px 4px;border-radius:4px 0 0 4px",
  "background:#f97316;color:#fff;padding:2px 4px;border-radius:0 4px 4px 0"
);
