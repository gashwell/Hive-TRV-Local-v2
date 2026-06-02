"""Constants for Hive TRV Local v2."""
from __future__ import annotations

DOMAIN       = "hive_trv_local"
PLATFORMS    = ["climate", "button", "number"]

# ── Config entry ──────────────────────────────────────────────────────────────
CONFIG_VERSION   = 1
SCHEMA_VERSION   = 1

CONF_BOILER_ENTITY      = "boiler_entity"
CONF_ENABLE_DIAGNOSTICS = "enable_diagnostics"

ENTRY_DEFAULTS: dict = {
    CONF_BOILER_ENTITY:      None,
    CONF_ENABLE_DIAGNOSTICS: False,
}

# ── hass.data keys ────────────────────────────────────────────────────────────
DATA_STORE   = "store"
DATA_BOILER  = "boiler_mgr"

# ── Modes ─────────────────────────────────────────────────────────────────────
MODE_MANUAL   = "manual"
MODE_SCHEDULE = "schedule"
MODE_BOOST    = "boost"
MODE_OFF      = "off"

# ── Boost defaults ────────────────────────────────────────────────────────────
DEFAULT_BOOST_TEMP    = 22.0
DEFAULT_BOOST_MINUTES = 30
DEFAULT_FROST_TEMP    = 7.0

# ── Known Hive / Danfoss Z2M model strings ────────────────────────────────────
# Used to filter the group member picker to relevant TRV devices.
# Other climate entities can be added via the manual override in Configure.
HIVE_DANFOSS_MODELS = {
    "UK7004240",   # Hive Radiator Valve
    "TRV001",      # Hive Radiator Valve (alt)
    "SLT510",      # Hive Thermostat Mini
    "SLT6",        # Hive Thermostat
    "STHTR001",    # Hive Smart Thermostat
    "eTRV0100",    # Danfoss Ally
    "eTRV0103",    # Danfoss Ally
    "eTRV0111",    # Danfoss Ally
    "014G2461",    # Danfoss Icon
    "SORB",        # Danfoss Icon
    "POPP-009501", # Popp POPZ701721
}

# ── Services ──────────────────────────────────────────────────────────────────
SERVICE_BOOST            = "boost"
SERVICE_END_BOOST        = "end_boost"
SERVICE_SET_SCHEDULE     = "set_schedule"
SERVICE_CLEAR_SCHEDULE   = "clear_schedule"
SERVICE_ADVANCE_SCHEDULE = "advance_schedule"

# ── Events ────────────────────────────────────────────────────────────────────
EVENT_ROOM_ADDED   = f"{DOMAIN}_room_added"    # entry_id, room_id, coordinator
EVENT_ROOM_REMOVED = f"{DOMAIN}_room_removed"  # entry_id, room_id, freed_members
EVENT_ROOM_UPDATED = f"{DOMAIN}_room_updated"  # entry_id, room_id, added_members, removed_members

# ── Service attribute names ───────────────────────────────────────────────────
ATTR_BOOST_TEMPERATURE = "temperature"
ATTR_BOOST_DURATION    = "duration_minutes"
ATTR_SCHEDULE          = "schedule"
