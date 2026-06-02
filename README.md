# Hive TRV Local v2

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![Release](https://img.shields.io/github/v/release/gashwell/Hive-TRV-Local-v2)](https://github.com/gashwell/Hive-TRV-Local-v2/releases)

Room group management and boiler demand control for Hive/Danfoss TRVs in Home Assistant.

**This integration works on top of your existing Z2M TRV entities — it does not replace them.**

---

## What it does

| Feature | Description |
|---|---|
| **Room groups** | Combine multiple Z2M TRV entities into a single virtual room climate entity |
| **Boiler demand** | Turns a boiler/receiver entity on or off based on aggregate heat demand across all groups |
| **Weekly schedules** | Set heating schedules on room groups via preset or service call |
| **Boost** | One-press boost on a room group at configurable temperature and duration |
| **Hive TRV Card** | Bundled Lovelace card — auto-registered, no manual resource setup |

---

## What it does NOT do

- ❌ Create individual TRV climate entities — Z2M already provides those
- ❌ Talk to MQTT directly — all commands go through HA service calls
- ❌ Require Z2M configuration changes

---

## Requirements

- Home Assistant 2024.1+
- Zigbee2MQTT HA integration configured and TRVs already showing as `climate.*` entities
- A boiler/receiver entity to control (climate, switch, or input_boolean)

---

## Installation

**HACS → Integrations → ⋮ → Custom repositories**
```
https://github.com/gashwell/Hive-TRV-Local-v2    category: Integration
```
Install **Hive TRV Local**, restart Home Assistant.

---

## Setup

**Settings → Integrations → Add Integration → Hive TRV Local**

One click — no configuration at install time. All settings are in **Configure**.

---

## Configure

**Settings → Integrations → Hive TRV Local → Configure**

### Device settings

| Option | Description |
|---|---|
| **Boiler / receiver entity** | Turned on when any group member is calling for heat; turned off when none are. Supports `climate`, `switch`, `input_boolean`. |
| **Diagnostic logging** | Enables `HIVE_DIAG` entries in the HA log for troubleshooting. |

### Manage room groups

#### Create a room group (3 steps)

1. **Name** — e.g. `Living Room`
2. **Select TRVs** — pick Hive/Danfoss Z2M climate entities from the dropdown. Each device can only be in one group.
3. **Extra temperature sensors** — optional HA temperature sensors to include in the room average

A new `climate.living_room` entity appears immediately — no restart needed.

#### Edit group members

Change which TRVs belong to a group without removing it.

#### Set a heating schedule

Apply a preset or clear the schedule for a room group.

| Preset | Mon–Fri | Weekends |
|---|---|---|
| **Comfort** | 21°C 06:30–09:00 & 17:00–22:30, 18°C during day, 16°C night | 21°C 08:00–23:00, 16°C night |
| **Eco** | 19°C 07:00–09:00 & 17:30–22:30, 16°C otherwise | 19°C 08:30–23:00, 16°C night |
| **Keep existing** | No change | — |
| **Clear** | Removes schedule, returns to manual mode | — |

For custom slot schedules use the `hive_trv_local.set_schedule` service.

#### Remove a room group

Removes the group entity. Z2M TRV entities are unaffected.

---

## Room group entities

Each room group creates a device with the following entities:

| Entity | Description |
|---|---|
| `climate.*` | Group climate entity — average temperature, fan-out commands |
| `button.* Boost` | One-press boost at stored default temperature and duration. Requires boiler entity configured. |
| `button.* End Boost` | Cancel active boost. Available only when boosting. |
| `number.* Boost Temperature` | Default boost temperature (5–32 °C, 0.5 steps) |
| `number.* Boost Duration` | Default boost duration in minutes (1–240) |

### Group climate attributes

The room group `climate.*` entity exposes these state attributes:

| Attribute | Description |
|---|---|
| `members` | List of member entity IDs |
| `member_count` | Number of members |
| `member_temperatures` | Dict of `entity_id: temperature` for each member |
| `heat_required` | True if any member is actively heating |
| `mode` | Current mode: `manual`, `schedule`, `boost`, or `off` |
| `schedule` | List of schedule slots (time, days, temperature) |
| `schedule_current_slot` | Index of the currently active slot |
| `boost_ends` | Boost end datetime (when boosting) |
| `boost_remaining_minutes` | Minutes remaining on boost (when boosting) |

---

## Services

All services are available in **Settings → Developer Tools → Services**.

### `hive_trv_local.boost`

Start a timed boost on a room group.

```yaml
service: hive_trv_local.boost
data:
  entity_id: climate.living_room
  temperature: 22.0        # optional — uses stored default if omitted
  duration_minutes: 30     # optional — uses stored default if omitted
```

### `hive_trv_local.end_boost`

Cancel an active boost and return to the previous mode.

```yaml
service: hive_trv_local.end_boost
data:
  entity_id: climate.living_room
```

### `hive_trv_local.set_schedule`

Set a custom weekly schedule on a room group.

```yaml
service: hive_trv_local.set_schedule
data:
  entity_id: climate.living_room
  schedule:
    - days: [0, 1, 2, 3, 4]    # 0=Monday … 6=Sunday
      time: "06:30"
      temperature: 21.0
    - days: [0, 1, 2, 3, 4]
      time: "09:00"
      temperature: 18.0
    - days: [0, 1, 2, 3, 4]
      time: "17:00"
      temperature: 21.0
    - days: [0, 1, 2, 3, 4]
      time: "22:30"
      temperature: 16.0
    - days: [5, 6]
      time: "08:00"
      temperature: 21.0
    - days: [5, 6]
      time: "23:00"
      temperature: 16.0
```

### `hive_trv_local.clear_schedule`

Remove the schedule from a room group (returns to manual mode).

```yaml
service: hive_trv_local.clear_schedule
data:
  entity_id: climate.living_room
```

### `hive_trv_local.advance_schedule`

Skip to the next scheduled slot immediately.

```yaml
service: hive_trv_local.advance_schedule
data:
  entity_id: climate.living_room
```

---

## Hive TRV Card

A Lovelace card is bundled with the integration and auto-registered — no manual resource setup needed.

### Adding to a dashboard

**Dashboard → Edit → Add Card → search "Hive TRV"**

Or add manually in YAML:

**Individual TRV:**
```yaml
type: custom:hive-trv-card
entity: climate.living_room_trv
battery_entity: sensor.living_room_trv_battery     # optional
demand_entity: sensor.living_room_trv_heating_demand  # optional
orientation_entity: select.living_room_trv_mounting_orientation  # optional (from Hive Local TRV v1)
```

**Room group:**
```yaml
type: custom:hive-trv-card
entity: climate.living_room
members:
  - entity: climate.living_room_trv_1
    name: Radiator by window
  - entity: climate.living_room_trv_2
    name: Radiator by door
```

### Card features

| Feature | Individual TRV | Room group |
|---|---|---|
| Current temperature | ✓ | ✓ (average) |
| Target temperature +/− | ✓ | ✓ |
| Manual / Schedule / Boost / Off modes | ✓ | ✓ |
| Boost panel with temp/duration sliders | ✓ | ✓ |
| Boost countdown timer | ✓ | ✓ |
| Schedule slot view | ✓ | ✓ |
| Skip to next schedule slot | ✓ | ✓ |
| Battery bar | ✓ | — |
| Heating demand bar | ✓ | ✓ |
| Signal strength | ✓ | — |
| Valve mounting orientation | ✓ | — |
| Window open/close toggle | ✓ | — |
| Frost protect shortcut | ✓ | ✓ |
| Per-member temperatures | — | ✓ |

---

## Boiler demand

When a boiler/receiver entity is configured, the integration monitors the `hvac_action` attribute of all group member climate entities.

- If **any member is actively heating** → boiler entity is turned **on**
- When **no members are heating** → boiler entity is turned **off**

The boiler entity is updated in real time as TRV states change — no polling.

---

## Supported TRV models

The group member picker filters to known Hive/Danfoss TRV models by default:

| Model | Device |
|---|---|
| UK7004240 / TRV001 | Hive Radiator Valve |
| SLT510 / SLT6 / STHTR001 | Hive Thermostat |
| eTRV0100 / eTRV0103 / eTRV0111 | Danfoss Ally |
| 014G2461 / SORB | Danfoss Icon |

Other Z2M climate entities can be added to groups manually by typing the entity ID.

---

## Updates

Update in HACS and restart Home Assistant. Existing groups and schedules are preserved.

---

## Troubleshooting

**No TRVs shown in group member picker** — check that Z2M is running and your TRVs are paired. The picker shows entities from known Hive/Danfoss models only. If your model is not listed, open a GitHub issue.

**Boost buttons greyed out** — a boiler/receiver entity must be configured in Configure → Device settings before boost buttons become active.

**Schedule not applying** — check the room group climate entity's `schedule` attribute in Developer Tools → States to confirm the schedule is stored. The ScheduleManager fires at each slot boundary.

**Card not appearing in card picker** — clear the browser cache (Ctrl+Shift+R) after installing or updating the integration.

**Diagnostic logging** — enable via Configure → Device settings → Enable diagnostic logging. Search for `HIVE_DIAG` in Settings → System → Logs → Load Full Log.

---

## Architecture

```
Hive TRV Local v2
├── config_flow.py    — setup + options (groups, boiler, settings)
├── __init__.py       — lifecycle, services, card registration
├── room.py           — HiveRoomCoordinator (HA service calls, schedules)
├── boiler.py         — BoilerDemandManager (watches hvac_action states)
├── storage.py        — versioned persistent storage (rooms, schedules, boost defaults)
├── schedule.py       — ScheduleManager (weekly slot engine)
├── climate.py        — room group climate entities
├── button.py         — Boost / End Boost buttons per group
├── number.py         — Boost Temperature / Duration per group
├── const.py          — constants, model list, event names
└── hive-trv-card.js  — bundled Lovelace card (auto-registered)
```
