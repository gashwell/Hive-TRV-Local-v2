# Hive TRV Local

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![Release](https://img.shields.io/github/v/release/gashwell/Hive-TRV-Local-v2)](https://github.com/gashwell/Hive-TRV-Local-v2/releases)

Room group management and boiler demand control for Hive/Danfoss TRVs via Zigbee2MQTT.

**This integration does not replace Z2M's HA entities.** It sits on top of them, adding:
- Virtual room groups that control multiple TRVs together
- Boiler/receiver demand management based on aggregate heat demand
- Weekly schedules for room groups
- Boost controls per room group

## Requirements

- Home Assistant 2024.1+
- Zigbee2MQTT HA integration (your TRVs already showing as climate entities in HA)
- A boiler/receiver entity to drive (climate, switch, or input_boolean)

## Installation

**HACS → Custom repositories → `https://github.com/gashwell/Hive-TRV-Local-v2`**

## Setup

Settings → Integrations → Add → **Hive TRV Local**

One click — no configuration at setup time. Everything is in Configure afterwards.

## Configure

**Settings → Integrations → Hive TRV Local → Configure**

### Device settings
- **Boiler / receiver entity** — turned on when any group member calls for heat
- **Diagnostic logging** — enable HIVE_DIAG log entries for troubleshooting

### Manage room groups

**Create** (3 steps): name → pick TRVs → optional extra temperature sensors

**Edit**: change group membership

**Set schedule**: apply a Comfort or Eco preset, or clear (manual mode). Custom slot schedules via `hive_trv_local.set_schedule` service.

**Remove**: removes the group entity. Z2M TRV entities are unaffected.

## Room group entities

Each group creates a device with:
- `climate.*` — group climate entity (average temp, fan-out commands)
- `button.* Boost` — one-press boost at stored default temp/duration
- `button.* End Boost` — cancel active boost
- `number.* Boost Temperature` — default boost temperature
- `number.* Boost Duration` — default boost duration (minutes)

## Services

| Service | Description |
|---|---|
| `hive_trv_local.boost` | Start boost on a room group |
| `hive_trv_local.end_boost` | Cancel boost |
| `hive_trv_local.set_schedule` | Set custom weekly schedule |
| `hive_trv_local.clear_schedule` | Clear schedule |
| `hive_trv_local.advance_schedule` | Skip to next slot |
