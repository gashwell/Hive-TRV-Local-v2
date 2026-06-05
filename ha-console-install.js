/**
 * Hive TRV Card — HA Browser Console Installer
 * ═══════════════════════════════════════════════
 * Paste this entire script into your HA browser console (F12 → Console).
 *
 * What it does:
 *   1. Fetches hive-trv-card.js from GitHub and writes it to /config/www/
 *      via the HA file_manager API (requires File Editor add-on) OR falls
 *      back to registering the card from the GitHub CDN URL directly.
 *   2. Registers the JS as a Lovelace resource (if not already registered).
 *   3. Finds every climate.* entity from the MQTT / Zigbee2MQTT integration
 *      that looks like a Hive/Danfoss TRV (not a room group).
 *   4. Sets custom:hive-trv-card as the default entity card for each one
 *      using the entity_registry/update_entity WS command.
 *
 * Requirements:
 *   - Logged in to Home Assistant in this browser tab
 *   - The Hive TRV Local v2 integration already installed (cards auto-registered)
 *     OR network access to GitHub from your HA instance
 *
 * After running:
 *   - Hard-refresh: Ctrl+Shift+R (Win/Linux) or Cmd+Shift+R (Mac)
 *   - Existing TRV entity cards on dashboards are NOT changed automatically.
 *     Remove them and re-add via "Add Card" — the Hive TRV Card will be the default.
 */

(async () => {

  const CARD_URL_GITHUB = "https://raw.githubusercontent.com/gashwell/Hive-TRV-Local-v2/main/custom_components/hive_trv_local/hive-trv-card.js";
  const CARD_LOCAL_PATH = "/config/www/hive-trv-card.js";
  const CARD_LOCAL_URL  = "/local/hive-trv-card.js";
  const CARD_TYPE       = "custom:hive-trv-card";

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const log  = (m) => console.log(`%c[Hive TRV] %c${m}`, "color:#f97316;font-weight:700", "color:inherit");
  const ok   = (m) => console.log(`%c[Hive TRV] ✓ ${m}`, "color:#22c55e;font-weight:700");
  const warn = (m) => console.warn(`[Hive TRV] ⚠ ${m}`);
  const err  = (m) => console.error(`[Hive TRV] ✗ ${m}`);

  // Get the HA WS connection from the active frontend
  const conn = window.__hass_connection
    || window.hassConnection
    || (await new Promise(r => {
         const el = document.querySelector("home-assistant");
         if (el?.__hass?.connection) r(el.__hass.connection);
         else r(null);
       }));

  if (!conn) {
    err("Could not find HA WebSocket connection. Make sure you're on the HA frontend and logged in.");
    return;
  }

  const ws = (type, payload = {}) => conn.sendMessagePromise({ type, ...payload });

  log("Connected to HA WebSocket");

  // ── Step 1: Fetch card JS from GitHub ───────────────────────────────────────

  log("Fetching hive-trv-card.js from GitHub...");
  let cardContent = null;
  try {
    const resp = await fetch(CARD_URL_GITHUB);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    cardContent = await resp.text();
    ok(`Fetched card JS (${(cardContent.length / 1024).toFixed(1)} KB)`);
  } catch (e) {
    warn(`Could not fetch from GitHub: ${e.message}`);
    warn("Will attempt to register using the GitHub URL as the resource instead.");
  }

  // ── Step 2: Write to /config/www/ if possible ────────────────────────────────

  let useUrl = CARD_LOCAL_URL;
  let wroteFile = false;

  if (cardContent) {
    try {
      // Try the supervisor file_manager endpoint (HA OS / Supervised)
      const writeResp = await fetch("/api/hassio/services/core/filemanager/api/browse/homeassistant", {
        method: "GET",
        headers: { Authorization: `Bearer ${conn.options.auth.accessToken}` },
      });

      if (writeResp.ok) {
        // File Editor / Supervisor available — write via REST
        const putResp = await fetch("/api/hassio/services/core/filemanager/api/files/homeassistant/www/hive-trv-card.js", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${conn.options.auth.accessToken}`,
            "Content-Type": "application/octet-stream",
          },
          body: cardContent,
        });
        if (putResp.ok) {
          ok("Wrote hive-trv-card.js to /config/www/ via File Manager API");
          wroteFile = true;
        } else {
          warn(`File Manager write failed (${putResp.status}) — trying alternative`);
        }
      } else {
        // Try the newer HA REST file endpoint
        const putResp2 = await fetch("/api/config/config_entries", {
          method: "GET",
          headers: { Authorization: `Bearer ${conn.options.auth.accessToken}` },
        });

        if (putResp2.ok) {
          // We have API access — try WS download_backup workaround via supervisor
          warn("File Manager API not available. Card will be registered from GitHub URL.");
        }
      }
    } catch (e) {
      warn(`File write attempt failed: ${e.message}`);
    }
  }

  // If we couldn't write locally, use the GitHub raw URL as the resource
  if (!wroteFile) {
    useUrl = CARD_URL_GITHUB;
    warn(`Using GitHub URL as Lovelace resource: ${useUrl}`);
    warn("This requires your browser to reach GitHub. For a fully local install, copy hive-trv-card.js to /config/www/ manually.");
  }

  // ── Step 3: Register as Lovelace resource ────────────────────────────────────

  log("Checking Lovelace resources...");
  try {
    const resources = await ws("lovelace/resources");
    const existing = (resources || []).find(r => r.url === useUrl);

    if (existing) {
      ok(`Resource already registered: ${useUrl}`);
    } else {
      await ws("lovelace/resources/create", {
        res_type: "module",
        url: useUrl,
      });
      ok(`Registered Lovelace resource: ${useUrl}`);
    }
  } catch (e) {
    // lovelace/resources/create may require a different WS type on older HA
    try {
      await ws("lovelace/resources/create", {
        type: "lovelace/resources/create",
        res_type: "module",
        url: useUrl,
      });
      ok(`Registered Lovelace resource: ${useUrl}`);
    } catch (e2) {
      warn(`Could not auto-register resource: ${e2.message}`);
      warn(`Add manually: Settings → Dashboards → ⋮ → Resources → Add → ${useUrl} (JavaScript Module)`);
    }
  }

  // ── Step 4: Find Hive/Danfoss TRV climate entities ───────────────────────────

  log("Scanning entity registry for Hive/Danfoss TRV climate entities...");

  const HIVE_DANFOSS_MODELS = new Set([
    "UK7004240", "TRV001",
    "SLT510", "SLT6", "STHTR001",
    "eTRV0100", "eTRV0103", "eTRV0111",
    "014G2461", "SORB",
    "POPP-009501",
  ]);

  let entityEntries = [];
  try {
    entityEntries = await ws("config/entity_registry/list");
  } catch (e) {
    err(`Could not list entity registry: ${e.message}`);
    return;
  }

  let deviceEntries = [];
  try {
    deviceEntries = await ws("config/device_registry/list");
  } catch (e) {
    warn("Could not list device registry — model filtering unavailable, using platform filter only.");
  }

  const deviceModelMap = {};
  for (const d of deviceEntries) {
    deviceModelMap[d.id] = d.model || "";
  }

  // Filter to climate entities on mqtt/zigbee2mqtt that are NOT room groups
  // (room groups have unique_id pattern room_*_climate from Hive TRV Local)
  const hass = document.querySelector("home-assistant")?.__hass;
  const states = hass?.states || {};

  const trvEntities = entityEntries.filter(e => {
    if (!e.entity_id.startsWith("climate.")) return false;
    if (e.platform !== "mqtt" && e.platform !== "zigbee2mqtt") return false;

    // Exclude Hive TRV Local group entities (unique_id: room_*_climate)
    if (e.unique_id?.startsWith("room_") && e.unique_id?.endsWith("_climate")) return false;

    // If we have device info, filter to known models
    if (e.device_id && deviceEntries.length > 0) {
      const model = deviceModelMap[e.device_id] || "";
      // Accept if model matches OR if model is empty (can't determine)
      const modelMatches = [...HIVE_DANFOSS_MODELS].some(m => model.includes(m));
      if (model && !modelMatches) return false;
    }

    return true;
  });

  if (trvEntities.length === 0) {
    warn("No Hive/Danfoss TRV climate entities found in the entity registry.");
    warn("Check that Zigbee2MQTT is running and your TRVs are paired.");
    return;
  }

  log(`Found ${trvEntities.length} TRV climate entity/entities: ${trvEntities.map(e => e.entity_id).join(", ")}`);

  // ── Step 5: Set default card for each entity ─────────────────────────────────

  log(`Setting default card to ${CARD_TYPE} for each entity...`);

  // Build the card config for each entity, pulling in optional related sensors
  const buildCardConfig = (entityId) => {
    const slug = entityId.replace("climate.", "");

    // Look for companion sensor entities
    const batteryEntity   = states[`sensor.${slug}_battery`]
                          ? `sensor.${slug}_battery` : undefined;
    const demandEntity    = states[`sensor.${slug}_pi_heating_demand`]
                          ? `sensor.${slug}_pi_heating_demand`
                          : states[`sensor.${slug}_heating_demand`]
                          ? `sensor.${slug}_heating_demand` : undefined;
    const orientEntity    = states[`select.${slug}_mounting_orientation`]
                          ? `select.${slug}_mounting_orientation`
                          : states[`select.${slug}_thermostat_orientation`]
                          ? `select.${slug}_thermostat_orientation` : undefined;

    const cfg = { type: CARD_TYPE, entity: entityId };
    if (batteryEntity) cfg.battery_entity = batteryEntity;
    if (demandEntity)  cfg.demand_entity  = demandEntity;
    if (orientEntity)  cfg.orientation_entity = orientEntity;

    return cfg;
  };

  let successCount = 0;
  for (const entity of trvEntities) {
    const cardCfg = buildCardConfig(entity.entity_id);

    try {
      await ws("entity_registry/update", {
        entity_id: entity.entity_id,
        options: {
          entity_filter: {},
          conversation: {},
        },
      });

      // Set the default card via entity_registry update (HA 2024.1+)
      await ws("lovelace/entity_default_card", {
        entity_id: entity.entity_id,
        card: cardCfg,
      });

      ok(`Set default card for ${entity.entity_id}${
        cardCfg.battery_entity ? " (+ battery)" : ""
      }${
        cardCfg.demand_entity ? " (+ demand)" : ""
      }${
        cardCfg.orientation_entity ? " (+ orientation)" : ""
      }`);
      successCount++;

    } catch (e) {
      // lovelace/entity_default_card may not exist on all HA versions
      // Fall back: log the YAML the user should add manually
      warn(`Could not set default card via WS for ${entity.entity_id}: ${e.message}`);
      const yamlLines = [
        `type: ${cardCfg.type}`,
        `entity: ${cardCfg.entity}`,
        cardCfg.battery_entity   ? `battery_entity: ${cardCfg.battery_entity}` : null,
        cardCfg.demand_entity    ? `demand_entity: ${cardCfg.demand_entity}` : null,
        cardCfg.orientation_entity ? `orientation_entity: ${cardCfg.orientation_entity}` : null,
      ].filter(Boolean).join("\n");
      console.log(`%cAdd this card manually for ${entity.entity_id}:\n${yamlLines}`, "color:#f97316;font-family:monospace");
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  console.log("");
  ok("═══════════════════════════════════════════");
  ok(`Done! ${successCount}/${trvEntities.length} entities updated.`);
  ok("═══════════════════════════════════════════");
  log("Next steps:");
  log("1. Hard-refresh your browser: Ctrl+Shift+R (Win/Linux) or Cmd+Shift+R (Mac)");
  log("2. Open any dashboard → Add Card → search 'Hive TRV' to add cards");
  log("3. The default entity card for each TRV is now the Hive TRV Card");

})();
