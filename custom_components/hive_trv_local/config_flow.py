"""Config flow for Hive TRV Local v2."""
from __future__ import annotations

import logging
import uuid
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er, selector

from .const import (
    CONF_BOILER_ENTITY, CONF_ENABLE_DIAGNOSTICS,
    CONFIG_VERSION, DATA_BOILER, DATA_STORE, DOMAIN,
    ENTRY_DEFAULTS, EVENT_ROOM_ADDED, EVENT_ROOM_REMOVED, EVENT_ROOM_UPDATED,
    HIVE_DANFOSS_MODELS,
)

_LOGGER = logging.getLogger(f"custom_components.{DOMAIN}.config_flow")


class HiveTRVLocalConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Single-instance config flow — no per-device setup needed."""

    VERSION = CONFIG_VERSION

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(
                title="Hive TRV Local",
                data={**ENTRY_DEFAULTS},
            )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({}),
            description_placeholders={
                "info": "Adds room group management and boiler demand control "
                        "on top of your existing Zigbee2MQTT TRV entities. "
                        "Configure groups and boiler after installation via Configure."
            },
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> "HiveTRVLocalOptionsFlow":
        return HiveTRVLocalOptionsFlow()


class HiveTRVLocalOptionsFlow(config_entries.OptionsFlow):
    """Options flow — settings and group management."""

    def __init__(self) -> None:
        self._room_name:    str = ""
        self._members:      list[str] = []
        self._sensors:      list[str] = []
        self._edit_room_id: str = ""
        self._edit_name:    str = ""

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _store(self):
        return self.hass.data.get(DOMAIN, {}).get(
            self.config_entry.entry_id, {}
        ).get(DATA_STORE)

    def _all_rooms(self) -> dict:
        s = self._store()
        return s.get_all_rooms() if s else {}

    def _grouped_eids(self, exclude: str | None = None) -> set[str]:
        grouped: set[str] = set()
        for rid, rd in self._all_rooms().items():
            if rid == exclude:
                continue
            grouped.update(rd.get("members", []))
        return grouped

    def _hive_danfoss_entity_ids(self) -> list[str]:
        """Return entity IDs of Z2M Hive/Danfoss TRV climate entities."""
        try:
            ent_reg = er.async_get(self.hass)
            result  = []
            for entry in ent_reg.entities.values():
                if entry.entity_id.split(".")[0] != "climate":
                    continue
                if entry.platform not in ("mqtt", "zigbee2mqtt"):
                    continue
                if entry.device_id:
                    from homeassistant.helpers import device_registry as dr
                    dev_reg = dr.async_get(self.hass)
                    device  = dev_reg.async_get(entry.device_id)
                    if device and device.model in HIVE_DANFOSS_MODELS:
                        result.append(entry.entity_id)
            return sorted(result)
        except Exception:
            return []

    def _no_rooms_entry(self) -> config_entries.FlowResult:
        """Return immediately if no groups exist yet."""
        return self.async_create_entry(title="", data=self.config_entry.options)

    # ── Top-level menu ────────────────────────────────────────────────────────

    async def async_step_init(self, _=None) -> config_entries.FlowResult:
        return self.async_show_menu(
            step_id="init",
            menu_options={
                "settings": "Device settings (boiler receiver, diagnostics)",
                "groups":   "Manage room groups",
            },
        )

    # ── Settings ──────────────────────────────────────────────────────────────

    async def async_step_settings(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        if user_input is not None:
            ed = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id, {})
            if bm := ed.get(DATA_BOILER):
                bm.update_boiler_entity(user_input.get(CONF_BOILER_ENTITY) or None)
            return self.async_create_entry(title="", data={
                **self.config_entry.options,
                CONF_BOILER_ENTITY:      user_input.get(CONF_BOILER_ENTITY) or None,
                CONF_ENABLE_DIAGNOSTICS: user_input.get(CONF_ENABLE_DIAGNOSTICS, False),
            })

        opts = self.config_entry.options
        data = self.config_entry.data
        return self.async_show_form(
            step_id="settings",
            data_schema=vol.Schema({
                vol.Optional(
                    CONF_BOILER_ENTITY,
                    description={"suggested_value": opts.get(CONF_BOILER_ENTITY) or data.get(CONF_BOILER_ENTITY)},
                ): selector.EntitySelector(selector.EntitySelectorConfig(
                    domain=["climate", "switch", "input_boolean"]
                )),
                vol.Optional(
                    CONF_ENABLE_DIAGNOSTICS,
                    default=opts.get(CONF_ENABLE_DIAGNOSTICS, False),
                ): selector.BooleanSelector(),
            }),
        )

    # ── Group management menu ─────────────────────────────────────────────────

    async def async_step_groups(self, _=None) -> config_entries.FlowResult:
        # Always show all four options — HA's async_show_menu validates options
        # against strings.json and does not support dynamic option lists.
        # Empty-rooms guard is handled inside each individual step instead.
        return self.async_show_menu(
            step_id="groups",
            menu_options={
                "create_group": "Create a new room group",
                "edit_group":   "Edit group members",
                "set_schedule": "Set a heating schedule",
                "remove_group": "Remove a room group",
            },
        )

    # ── Create group ──────────────────────────────────────────────────────────

    async def async_step_create_group(
        self, user_input: dict | None = None
    ) -> config_entries.FlowResult:
        errors: dict = {}
        if user_input is not None:
            name = user_input.get("room_name", "").strip()
            if not name:
                errors["room_name"] = "required"
            else:
                self._room_name = name
                return await self.async_step_create_group_members()
        return self.async_show_form(
            step_id="create_group",
            data_schema=vol.Schema({vol.Required("room_name"): selector.TextSelector()}),
            errors=errors,
        )

    async def async_step_create_group_members(
        self, user_input: dict | None = None
    ) -> config_entries.FlowResult:
        errors: dict = {}
        hive_eids = self._hive_danfoss_entity_ids()
        grouped   = self._grouped_eids()
        available = [e for e in hive_eids if e not in grouped]

        if user_input is not None:
            chosen = user_input.get("member_ids") or []
            if not chosen:
                errors["member_ids"] = "required"
            else:
                self._members = chosen
                return await self.async_step_create_group_sensors()

        return self.async_show_form(
            step_id="create_group_members",
            data_schema=vol.Schema({
                vol.Required("member_ids"): selector.EntitySelector(
                    selector.EntitySelectorConfig(
                        domain="climate",
                        multiple=True,
                        include_entities=available if available else None,
                    )
                ),
            }),
            description_placeholders={
                "room_name": self._room_name,
                "hint": (
                    f"{len(available)} Hive/Danfoss TRV(s) available."
                    if available else
                    "No Hive/Danfoss TRVs found. Check Z2M is running."
                ),
            },
            errors=errors,
        )

    async def async_step_create_group_sensors(
        self, user_input: dict | None = None
    ) -> config_entries.FlowResult:
        if user_input is not None:
            self._sensors = user_input.get("temp_sensors") or []
            return await self._do_create_group()
        return self.async_show_form(
            step_id="create_group_sensors",
            data_schema=vol.Schema({
                vol.Optional("temp_sensors"): selector.EntitySelector(
                    selector.EntitySelectorConfig(
                        domain="sensor", device_class="temperature", multiple=True
                    )
                ),
            }),
            description_placeholders={
                "room_name":    self._room_name,
                "member_count": str(len(self._members)),
            },
        )

    async def _do_create_group(self) -> config_entries.FlowResult:
        store   = self._store()
        room_id = str(uuid.uuid4())
        data    = {
            "name":         self._room_name,
            "members":      self._members,
            "temp_sensors": self._sensors,
            "schedule":     [],
        }
        if store:
            await store.async_save_room(room_id, data)
        self.hass.bus.async_fire(EVENT_ROOM_ADDED, {
            "entry_id":  self.config_entry.entry_id,
            "room_id":   room_id,
            "room_data": data,
        })
        return self.async_create_entry(title="", data=self.config_entry.options)

    # ── Edit group ────────────────────────────────────────────────────────────

    async def async_step_edit_group(
        self, user_input: dict | None = None
    ) -> config_entries.FlowResult:
        rooms = self._all_rooms()
        if not rooms:
            return self._no_rooms_entry()

        if user_input is not None:
            chosen = user_input.get("room_name", "")
            for rid, rd in rooms.items():
                if rd.get("name") == chosen:
                    self._edit_room_id = rid
                    self._edit_name    = chosen
                    break
            return await self.async_step_edit_group_members()

        return self.async_show_form(
            step_id="edit_group",
            data_schema=vol.Schema({
                vol.Required("room_name"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=sorted(rd.get("name", rid) for rid, rd in rooms.items()),
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
            }),
        )

    async def async_step_edit_group_members(
        self, user_input: dict | None = None
    ) -> config_entries.FlowResult:
        errors: dict = {}
        current       = self._all_rooms().get(self._edit_room_id, {}).get("members", [])
        hive_eids     = self._hive_danfoss_entity_ids()
        other_grouped = self._grouped_eids(exclude=self._edit_room_id)
        available     = [e for e in hive_eids if e not in other_grouped]
        selectable    = sorted(set(current) | set(available))

        if user_input is not None:
            new_members = user_input.get("member_ids") or []
            if not new_members:
                errors["member_ids"] = "required"
            else:
                store = self._store()
                rd    = dict(self._all_rooms().get(self._edit_room_id, {}))
                rd["members"] = new_members
                if store:
                    await store.async_save_room(self._edit_room_id, rd)
                self.hass.bus.async_fire(EVENT_ROOM_UPDATED, {
                    "entry_id":        self.config_entry.entry_id,
                    "room_id":         self._edit_room_id,
                    "new_members":     new_members,
                    "added_members":   [m for m in new_members if m not in current],
                    "removed_members": [m for m in current if m not in new_members],
                })
                return self.async_create_entry(title="", data=self.config_entry.options)

        return self.async_show_form(
            step_id="edit_group_members",
            data_schema=vol.Schema({
                vol.Required("member_ids", default=current): selector.EntitySelector(
                    selector.EntitySelectorConfig(
                        domain="climate",
                        multiple=True,
                        include_entities=selectable if selectable else None,
                    )
                ),
            }),
            description_placeholders={"room_name": self._edit_name},
            errors=errors,
        )

    # ── Set schedule ──────────────────────────────────────────────────────────

    async def async_step_set_schedule(
        self, user_input: dict | None = None
    ) -> config_entries.FlowResult:
        rooms = self._all_rooms()
        if not rooms:
            return self._no_rooms_entry()

        if user_input is not None:
            for rid, rd in rooms.items():
                if rd.get("name") == user_input.get("room_name"):
                    self._edit_room_id = rid
                    self._edit_name    = user_input["room_name"]
                    break
            return await self.async_step_set_schedule_preset()

        return self.async_show_form(
            step_id="set_schedule",
            data_schema=vol.Schema({
                vol.Required("room_name"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=sorted(rd.get("name", rid) for rid, rd in rooms.items()),
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
            }),
        )

    async def async_step_set_schedule_preset(
        self, user_input: dict | None = None
    ) -> config_entries.FlowResult:
        PRESETS = {
            "comfort": [
                {"days": [0,1,2,3,4], "time": "06:30", "temperature": 21.0},
                {"days": [0,1,2,3,4], "time": "09:00", "temperature": 18.0},
                {"days": [0,1,2,3,4], "time": "17:00", "temperature": 21.0},
                {"days": [0,1,2,3,4], "time": "22:30", "temperature": 16.0},
                {"days": [5,6],       "time": "08:00", "temperature": 21.0},
                {"days": [5,6],       "time": "23:00", "temperature": 16.0},
            ],
            "eco": [
                {"days": [0,1,2,3,4], "time": "07:00", "temperature": 19.0},
                {"days": [0,1,2,3,4], "time": "09:00", "temperature": 16.0},
                {"days": [0,1,2,3,4], "time": "17:30", "temperature": 19.0},
                {"days": [0,1,2,3,4], "time": "22:30", "temperature": 16.0},
                {"days": [5,6],       "time": "08:30", "temperature": 19.0},
                {"days": [5,6],       "time": "23:00", "temperature": 16.0},
            ],
        }
        if user_input is not None:
            preset   = user_input.get("preset", "keep")
            store    = self._store()
            current  = self._all_rooms().get(self._edit_room_id, {}).get("schedule", [])
            schedule = [] if preset == "clear" else PRESETS.get(preset, current)

            if store and preset != "keep":
                await store.async_set_room_schedule(self._edit_room_id, schedule)

            ed = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id, {})
            rc = ed.get("rooms", {}).get(self._edit_room_id)
            if rc:
                if schedule:
                    self.hass.async_create_task(rc.async_set_schedule(schedule))
                else:
                    rc.clear_schedule()

            return self.async_create_entry(title="", data=self.config_entry.options)

        n = len(self._all_rooms().get(self._edit_room_id, {}).get("schedule", []))
        return self.async_show_form(
            step_id="set_schedule_preset",
            data_schema=vol.Schema({
                vol.Required("preset", default="comfort"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            selector.SelectOptionDict(value="comfort", label="Comfort — 21 °C days, 16 °C nights"),
                            selector.SelectOptionDict(value="eco",     label="Eco — 19 °C days, 16 °C nights"),
                            selector.SelectOptionDict(value="keep",    label=f"Keep existing ({n} slots)"),
                            selector.SelectOptionDict(value="clear",   label="Clear (manual mode)"),
                        ],
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
            }),
            description_placeholders={"room_name": self._edit_name},
        )

    # ── Remove group ──────────────────────────────────────────────────────────

    async def async_step_remove_group(
        self, user_input: dict | None = None
    ) -> config_entries.FlowResult:
        rooms = self._all_rooms()
        if not rooms:
            return self._no_rooms_entry()

        if user_input is not None:
            chosen = user_input.get("room_name")
            if chosen:
                store = self._store()
                for rid, rd in list(rooms.items()):
                    if rd.get("name") == chosen:
                        if store:
                            await store.async_remove_room(rid)
                        self.hass.bus.async_fire(EVENT_ROOM_REMOVED, {
                            "entry_id":      self.config_entry.entry_id,
                            "room_id":       rid,
                            "freed_members": rd.get("members", []),
                        })
                        break
            return self.async_create_entry(title="", data=self.config_entry.options)

        return self.async_show_form(
            step_id="remove_group",
            data_schema=vol.Schema({
                vol.Required("room_name"): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=sorted(rd.get("name", rid) for rid, rd in rooms.items()),
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
            }),
        )
