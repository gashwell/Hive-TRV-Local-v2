# Hive TRV Local — Architecture & Decision Guide

This document covers how v2 and v3 work, when to use each, and how the card
system fits together.

---

## Project overview

| | v1 `Hive-TRV-Local` | v2 `Hive-TRV-Local-v2` | v3 `Hive-TRV-Local-v3` |
|---|---|---|---|
| **Domain** | `hive_local_trv` | `hive_trv_local` | `hive_trv_local` |
| **Status** | Stable — bug fixes | Stable — feature complete | Pre-release — testing |
| **Group engine** | Custom (basic) | Custom (basic) | climate_group_helper (advanced) |
| **Sync modes** | ✗ | ✗ | Mirror / Lock / Master-Lock |
| **Calibration** | Offset slider | ✗ | Hive offset + Danfoss scaled (×100) |
| **Window control** | ✗ | ✗ | Binary sensor + delays |
| **Member offsets** | ✗ | ✗ | ±20 °C per TRV |
| **Member isolation** | ✗ | ✗ | Sensor / HVAC mode / manual-off triggers |
| **Schedule engine** | Custom slots | Custom slots | HA Schedule helpers |
| **Boiler demand** | ✓ | ✓ | ✓ |
| **TRV card** | ✓ (auto) | ✓ (auto) | ✓ (auto) |
| **Group card** | ✓ (auto) | ✓ (auto) | ✓ (auto) |
| **Individual TRV entities** | Creates per-TRV entities | None — Z2M only | None — Z2M only |

---

## Which version should I use?

```
Do you need advanced group management?
(sync modes, window control, member offsets, isolation)
│
├─ YES → Use v3
│         └─ Note: v3 is pre-release. Install v2 first, migrate when stable.
│
└─ NO → Do you want room groups + boiler demand only?
         │
         ├─ YES → Use v2
         │         └─ Simplest. No MQTT code. Z2M entities directly.
         │
         └─ Are you already on v1 and it's working?
                   │
                   └─ YES → Stay on v1 until v2 is ready for your install.
                            v1 and v2 use different HA domains so can coexist.
```

---

## How v2 works

### Architecture

```
Zigbee2MQTT
    │ MQTT
    ▼
HA MQTT Integration
    │ Creates climate.*, sensor.*, select.* entities per TRV
    ▼
Hive TRV Local v2  (hive_trv_local)
    │
    ├── HiveRoomCoordinator ──── reads HA states from Z2M entities
    │       │                    sends commands via climate.set_temperature,
    │       │                    climate.set_hvac_mode service calls
    │       │
    │       ├── ScheduleManager  — weekly slot engine
    │       └── stores boost defaults in HiveTRVStorage
    │
    ├── BoilerDemandManager ──── watches hvac_action on all group members
    │                            calls switch.turn_on / switch.turn_off
    │
    └── Hive TRV Card JS ──────── auto-registered via async_setup
            hive-trv-card         → individual Z2M TRV entities
            hive-trv-group-card   → room group entities
```

### Data flow — setting a room temperature

```
User adjusts target on group card
        │
        ▼
climate.set_temperature  (HA service call)
    entity_id: [climate.trv_1, climate.trv_2, ...]   ← all group members
        │
        ▼
HA MQTT Integration publishes to Z2M
        │
        ▼
Zigbee2MQTT sends to each physical TRV
```

### Data flow — boiler demand

```
Z2M TRV state changes  (hvac_action: heating / idle)
        │
        ▼
BoilerDemandManager.async_evaluate()
        │
        ├─ any member heating → switch.turn_on  (boiler entity)
        └─ no members heating → switch.turn_off (boiler entity)
```

### Storage schema

```json
{
  "schema_version": 1,
  "rooms": {
    "<uuid>": {
      "name": "Living Room",
      "members": ["climate.living_room_trv_1", "climate.living_room_trv_2"],
      "temp_sensors": [],
      "schedule": [
        {"days": [0,1,2,3,4], "time": "07:00", "temperature": 21.0},
        {"days": [0,1,2,3,4], "time": "09:00", "temperature": 18.0}
      ],
      "boost_temperature": 22.0,
      "boost_duration": 30
    }
  }
}
```

Stored at: `/config/.storage/hive_trv_local.<entry_id>`

### Group entity attributes

The room group `climate.*` entity exposes:

| Attribute | Type | Description |
|---|---|---|
| `members` | list | Member Z2M entity IDs |
| `member_count` | int | Number of members |
| `member_temperatures` | dict | `{entity_id: temperature}` per member |
| `heat_required` | bool | True if any member is heating |
| `mode` | str | `manual` / `schedule` / `boost` / `off` |
| `schedule` | list | Current schedule slots |
| `schedule_current_slot` | int | Index of active slot |
| `boost_ends` | datetime | When boost expires |
| `boost_remaining_minutes` | int | Minutes remaining on boost |

---

## How v3 works

### Architecture

```
Zigbee2MQTT
    │ MQTT
    ▼
HA MQTT Integration
    │ Creates climate.*, sensor.*, select.* entities per TRV
    ▼
Hive TRV Local v3  (hive_trv_local)
    │
    ├── climate_group_helper engine ─── full group management
    │       │
    │       ├── SyncMode      — Mirror / Lock / Master-Lock
    │       ├── Calibration   — OFFSET (Hive) / SCALED×100 (Danfoss)
    │       ├── WindowControl — binary sensor + configurable delays
    │       ├── MemberOffset  — per-TRV temperature offset ±20°C
    │       ├── Isolation     — sensor / HVAC mode / member-off triggers
    │       ├── Schedule      — HA Schedule helper integration
    │       └── Override      — timed boost with auto-restore
    │
    ├── BoilerDemandManager ─── same as v2
    │
    └── Hive TRV Card JS ─────── same two cards as v2
```

### Key differences from v2

**Groups are created as Helpers** (Settings → Helpers → Create Helper → Hive TRV Group),
not via Configure. This means each group is a separate config entry with its own
options flow, rather than all groups being managed under one integration entry.

**HA Schedule helpers** — instead of custom slot lists, v3 uses native HA schedule
entities. Create a schedule in Settings → Helpers → Schedule, add time slots with
`data: { hvac_mode: heat, temperature: 21.0 }`, then assign it to the group.

**Sync modes** — when a member TRV is changed directly (physical buttons, Z2M,
another automation), the group can:
- **Mirror** — push the change to all other members
- **Lock** — revert the member back to the group target
- **Master-Lock** — only changes on the designated master TRV are accepted

**Calibration** — v3 can write an external sensor value back to the TRV:
- Hive TRVs: uses `regulation_setpoint_offset` (OFFSET mode, delta in °C)
- Danfoss Ally: uses `external_measured_room_sensor` (SCALED mode, value × 100)

---

## Card decision guide

### Which card for which entity?

```
What type of climate entity do I have?
│
├─ climate.* from MQTT integration (Z2M entity)
│   Individual TRV → use  custom:hive-trv-card
│
└─ climate.* from hive_trv_local integration (group entity)
    Room group → use  custom:hive-trv-group-card
```

### How to tell them apart

In **Settings → Entities**, find your climate entity and check the Integration column:
- **MQTT** = Z2M individual TRV → `hive-trv-card`
- **Hive TRV Local** = room group → `hive-trv-group-card`

Or check the entity's attributes in Developer Tools → States:
- Has `members` attribute → it's a room group → `hive-trv-group-card`
- Has `battery` or `pi_heating_demand` attribute → individual TRV → `hive-trv-card`

### Card features

| Feature | `hive-trv-card` | `hive-trv-group-card` |
|---|---|---|
| Current temperature | ✓ | ✓ (average) |
| Target temperature +/− | ✓ | ✓ (all members) |
| Manual / Schedule / Boost / Off | ✓ | ✓ |
| Boost panel (temp + duration sliders) | ✓ | ✓ |
| Boost countdown | ✓ | ✓ |
| Schedule slot view + skip | ✓ | ✓ |
| Battery bar | ✓ | — |
| Heating demand bar | ✓ | ✓ |
| Signal strength | ✓ | — |
| Valve orientation | ✓ | — |
| Window open toggle | ✓ | — |
| Frost protect | ✓ | ✓ |
| Member temperature list | — | ✓ |
| Per-member heating indicator | — | ✓ |

### Card YAML

**Individual TRV:**
```yaml
type: custom:hive-trv-card
entity: climate.living_room_trv
battery_entity: sensor.living_room_trv_battery          # optional
demand_entity: sensor.living_room_trv_pi_heating_demand # optional
orientation_entity: select.living_room_trv_mounting_orientation  # optional (v1 only)
name: Living Room                                       # optional override
```

**Room group:**
```yaml
type: custom:hive-trv-group-card
entity: climate.living_room
name: Living Room                                       # optional override
```

---

## Event bus (v2)

v2 uses an internal HA event bus for room lifecycle management:

| Event | Payload | Purpose |
|---|---|---|
| `hive_trv_local_room_added` | `entry_id, room_id, coordinator` | New group created — platforms register entities |
| `hive_trv_local_room_removed` | `entry_id, room_id, freed_members` | Group deleted — platforms remove entities |
| `hive_trv_local_room_updated` | `entry_id, room_id, new_members, added_members, removed_members` | Membership changed |

---

## Services

Both v2 and v3 register these services (domain `hive_trv_local`):

| Service | Applies to | Description |
|---|---|---|
| `boost` | group entity | Start timed boost |
| `end_boost` | group entity | Cancel active boost |
| `set_schedule` | group entity | Set custom weekly schedule |
| `clear_schedule` | group entity | Remove schedule |
| `advance_schedule` | group entity | Skip to next slot immediately |

v3 adds (from climate_group_helper):

| Service | Description |
|---|---|
| `hive_trv_local.set_schedule_entity` | Switch to a different HA schedule helper |
| `hive_trv_local.boost` | Also supports `temperature_offset` (relative boost) |

---

## Versioning scheme

```
MAJOR.FEATURE.FIX

v2.0.3  = v2 major release, 0 feature sets, 3rd fix
v3.1.0  = v3 major release, 1st feature addition, no fixes

Major:   Breaking change (domain rename, storage schema change)
Feature: New entity types, new config options, new services
Fix:     Bug fix, import error, crash fix
```

---

## Upgrade path

```
v1  ──── working, keep if no issues
 │
 └──►  v2  ──── install alongside v1 (different domain)
               set up groups in v2, keep v1 TRV entities for individual control
               │
               └──►  v3  ──── uninstall v2, install v3 (same domain, different repo)
                              groups migrate to Helpers flow
                              schedule helpers replace custom slots
```

v1 (`hive_local_trv`) and v2/v3 (`hive_trv_local`) use **different HA domains**,
so v1 + v2 can coexist on the same HA instance. v2 and v3 share the same domain
and **cannot both be installed at once**.
