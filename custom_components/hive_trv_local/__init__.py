"""Hive TRV Local v2.

Pure coordination layer on top of Z2M / HA entities.
No MQTT. No duplicate entities. Room groups + boiler demand only.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    ATTR_BOOST_DURATION, ATTR_BOOST_TEMPERATURE, ATTR_SCHEDULE,
    CONF_BOILER_ENTITY, CONF_ENABLE_DIAGNOSTICS,
    CONFIG_VERSION, DATA_BOILER, DATA_STORE,
    DEFAULT_BOOST_MINUTES, DEFAULT_BOOST_TEMP,
    DOMAIN, ENTRY_DEFAULTS, EVENT_ROOM_ADDED, EVENT_ROOM_REMOVED,
    EVENT_ROOM_UPDATED, PLATFORMS,
    SERVICE_ADVANCE_SCHEDULE, SERVICE_BOOST, SERVICE_CLEAR_SCHEDULE,
    SERVICE_END_BOOST, SERVICE_SET_SCHEDULE,
)

_LOGGER = logging.getLogger(f"custom_components.{DOMAIN}")

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


# ── Diagnostic helper ──────────────────────────────────────────────────────────

def _diag(entry: ConfigEntry, msg: str, *args: Any) -> None:
    opts = entry.options or {}
    data = entry.data or {}
    if opts.get(CONF_ENABLE_DIAGNOSTICS, data.get(CONF_ENABLE_DIAGNOSTICS, False)):
        _LOGGER.warning("HIVE_DIAG " + msg, *args)


# ── Lifecycle ──────────────────────────────────────────────────────────────────

async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the Hive TRV Card JS with the HA frontend."""
    from pathlib import Path
    from homeassistant.components.frontend import add_extra_js_url
    from homeassistant.components.http import StaticPathConfig

    card_path = Path(__file__).parent / "hive-trv-card.js"
    url_path  = f"/{DOMAIN}/hive-trv-card.js"

    await hass.http.async_register_static_paths([
        StaticPathConfig(url_path, str(card_path), True)
    ])
    add_extra_js_url(hass, url_path)
    _LOGGER.info("Hive TRV Card registered at %s", url_path)
    return True


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    _LOGGER.info("Migrating config entry v%s → v%s", entry.version, CONFIG_VERSION)
    hass.config_entries.async_update_entry(
        entry,
        data={**ENTRY_DEFAULTS, **entry.data},
        version=CONFIG_VERSION,
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    from .boiler import BoilerDemandManager
    from .storage import HiveTRVStorage

    effective = {**ENTRY_DEFAULTS, **entry.data}

    def _get(key: str) -> Any:
        return (entry.options or {}).get(key, effective.get(key))

    boiler_entity = _get(CONF_BOILER_ENTITY)
    _diag(entry, "setup: boiler=%s", boiler_entity)

    # Storage
    store = HiveTRVStorage(hass, entry.entry_id)
    await store.async_load()

    # Room coordinators (loaded from storage)
    rooms: dict[str, Any] = {}

    def _get_rooms():
        return rooms

    # Boiler demand manager
    boiler_mgr = BoilerDemandManager(hass, boiler_entity, _get_rooms)

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
        DATA_STORE:  store,
        DATA_BOILER: boiler_mgr,
        "rooms":     rooms,
    }

    # Load persisted room groups
    for room_id, room_data in store.get_all_rooms().items():
        await _create_room(hass, entry, store, boiler_mgr, rooms, room_id, room_data)

    # Forward to entity platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Listen for room lifecycle events from config_flow
    @callback
    def _on_room_added(event: Any) -> None:
        if event.data.get("entry_id") != entry.entry_id:
            return
        if "coordinator" in event.data:
            return  # already created, fired by _create_room
        room_id   = event.data.get("room_id")
        room_data = event.data.get("room_data")
        if room_id and room_data:
            hass.async_create_task(
                _create_room(hass, entry, store, boiler_mgr, rooms, room_id, room_data)
            )

    @callback
    def _on_room_updated(event: Any) -> None:
        if event.data.get("entry_id") != entry.entry_id:
            return
        room_id     = event.data.get("room_id")
        new_members = event.data.get("new_members", [])
        if room_id in rooms:
            rooms[room_id].update_members(new_members)
            boiler_mgr.unsubscribe_all()
            for rc in rooms.values():
                boiler_mgr.subscribe_members(rc.member_entity_ids)

    @callback
    def _on_room_removed(event: Any) -> None:
        if event.data.get("entry_id") != entry.entry_id:
            return
        room_id = event.data.get("room_id")
        rc = rooms.pop(room_id, None)
        if rc:
            hass.async_create_task(rc.async_unload())
        boiler_mgr.unsubscribe_all()
        for r in rooms.values():
            boiler_mgr.subscribe_members(r.member_entity_ids)

    entry.async_on_unload(hass.bus.async_listen(EVENT_ROOM_ADDED,   _on_room_added))
    entry.async_on_unload(hass.bus.async_listen(EVENT_ROOM_UPDATED, _on_room_updated))
    entry.async_on_unload(hass.bus.async_listen(EVENT_ROOM_REMOVED, _on_room_removed))

    # Services
    if not hass.services.has_service(DOMAIN, SERVICE_BOOST):
        _register_services(hass)

    entry.async_on_unload(entry.add_update_listener(_reload))
    _diag(entry, "setup: COMPLETE — %d rooms loaded", len(rooms))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        ed = hass.data[DOMAIN].pop(entry.entry_id, {})
        for rc in ed.get("rooms", {}).values():
            await rc.async_unload()
        if bm := ed.get(DATA_BOILER):
            bm.unsubscribe_all()
    return ok


async def _reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


# ── Room creation helper ───────────────────────────────────────────────────────

async def _create_room(
    hass: HomeAssistant,
    entry: ConfigEntry,
    store: Any,
    boiler_mgr: Any,
    rooms: dict,
    room_id: str,
    room_data: dict,
) -> Any:
    from .room import HiveRoomCoordinator

    rc = HiveRoomCoordinator(
        hass,
        room_id=room_id,
        room_name=room_data["name"],
        member_entity_ids=room_data.get("members", []),
        temp_sensor_entity_ids=room_data.get("temp_sensors", []),
        store=store,
    )
    await rc.async_setup()
    rooms[room_id] = rc

    if room_data.get("schedule"):
        await rc.async_set_schedule(room_data["schedule"])

    # Wire boiler demand
    boiler_mgr.subscribe_members(rc.member_entity_ids)
    rc.async_add_listener(
        lambda: hass.async_create_task(boiler_mgr.async_evaluate())
    )

    # Fire fully-populated event so platforms can register entities
    hass.bus.async_fire(EVENT_ROOM_ADDED, {
        "entry_id":   entry.entry_id,
        "room_id":    room_id,
        "coordinator": rc,
    })
    return rc


# ── Services ───────────────────────────────────────────────────────────────────

def _register_services(hass: HomeAssistant) -> None:
    import voluptuous as vol

    def _room(entity_id: str) -> Any:
        """Find room coordinator by room group climate entity_id."""
        for ed in hass.data.get(DOMAIN, {}).values():
            for rc in ed.get("rooms", {}).values():
                slug = rc.room_name.lower().replace(" ", "_")
                if f"climate.{slug}" == entity_id:
                    return rc
        return None

    async def _boost(call: ServiceCall) -> None:
        rc = _room(call.data["entity_id"])
        if rc:
            await rc.async_start_boost(
                call.data.get(ATTR_BOOST_TEMPERATURE),
                call.data.get(ATTR_BOOST_DURATION),
            )

    async def _end_boost(call: ServiceCall) -> None:
        rc = _room(call.data["entity_id"])
        if rc:
            await rc.async_end_boost()

    async def _set_schedule(call: ServiceCall) -> None:
        rc = _room(call.data["entity_id"])
        if not rc:
            return
        schedule = call.data[ATTR_SCHEDULE]
        await rc.async_set_schedule(schedule)
        for ed in hass.data.get(DOMAIN, {}).values():
            store = ed.get(DATA_STORE)
            if store and rc.room_id in ed.get("rooms", {}):
                await store.async_set_room_schedule(rc.room_id, schedule)

    async def _clear_schedule(call: ServiceCall) -> None:
        rc = _room(call.data["entity_id"])
        if rc:
            rc.clear_schedule()

    async def _advance(call: ServiceCall) -> None:
        rc = _room(call.data["entity_id"])
        if rc:
            await rc._schedule_mgr.advance_to_next()

    _EID = vol.Schema({vol.Required("entity_id"): str})
    _BOOST_S = vol.Schema({
        vol.Required("entity_id"): str,
        vol.Optional(ATTR_BOOST_TEMPERATURE, default=DEFAULT_BOOST_TEMP): vol.Coerce(float),
        vol.Optional(ATTR_BOOST_DURATION,    default=DEFAULT_BOOST_MINUTES): vol.All(int, vol.Range(min=1, max=1440)),
    })
    _SCHEDULE_S = vol.Schema({
        vol.Required("entity_id"): str,
        vol.Required(ATTR_SCHEDULE): [vol.Schema({
            vol.Required("days"):        [vol.All(int, vol.Range(min=0, max=6))],
            vol.Required("time"):        str,
            vol.Required("temperature"): vol.Coerce(float),
        })],
    })

    hass.services.async_register(DOMAIN, SERVICE_BOOST,            _boost,        _BOOST_S)
    hass.services.async_register(DOMAIN, SERVICE_END_BOOST,        _end_boost,    _EID)
    hass.services.async_register(DOMAIN, SERVICE_SET_SCHEDULE,     _set_schedule, _SCHEDULE_S)
    hass.services.async_register(DOMAIN, SERVICE_CLEAR_SCHEDULE,   _clear_schedule, _EID)
    hass.services.async_register(DOMAIN, SERVICE_ADVANCE_SCHEDULE, _advance,      _EID)
