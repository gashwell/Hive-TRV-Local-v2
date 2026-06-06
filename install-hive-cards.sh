#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Hive TRV Local v2 — Card Installer
#  Run in the Home Assistant terminal (Settings → System → Terminal, or SSH)
#
#  What this does:
#    1. Downloads hive-trv-card.js and hive-trv-group-card.js from latest release
#    2. Places them in /config/www/
#    3. Registers them as Lovelace JavaScript Module resources
#    4. Tells you what to do next
#
#  Usage:
#    bash install-hive-cards.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

REPO="gashwell/Hive-TRV-Local-v2"
WWW_DIR="/config/www"
STORAGE_DIR="/config/.storage"
CARD_FILES=("hive-trv-card.js" "hive-trv-group-card.js")

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()      { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
err()     { echo -e "  ${RED}✗${RESET}  $*" >&2; }
section() { echo -e "\n${CYAN}${BOLD}── $* ──${RESET}"; }
die()     { err "$*"; exit 1; }

# ── Banner ─────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Hive TRV Local v2 — Card Installer${RESET}"
echo    "  Repo: https://github.com/${REPO}"
echo    "════════════════════════════════════════════════"

# ── Check dependencies ─────────────────────────────────────────────────────────
section "Checking dependencies"

for cmd in curl python3; do
    if command -v "$cmd" &>/dev/null; then
        ok "$cmd found"
    else
        die "$cmd is not available — cannot continue"
    fi
done

# ── Resolve latest release tag ─────────────────────────────────────────────────
section "Resolving latest release"

TAG=$(curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/releases/latest" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null) \
  || TAG="main"

echo "  Latest release: ${TAG}"

# Base URL for card JS files inside the release
BASE_URL="https://raw.githubusercontent.com/${REPO}/${TAG}/custom_components/hive_trv_local"

# ── Create /config/www/ ────────────────────────────────────────────────────────
section "Preparing /config/www/"

if [[ ! -d "$WWW_DIR" ]]; then
    mkdir -p "$WWW_DIR"
    ok "Created ${WWW_DIR}"
else
    ok "${WWW_DIR} already exists"
fi

# ── Download card files ────────────────────────────────────────────────────────
section "Downloading card files"

DOWNLOADED=()
for fname in "${CARD_FILES[@]}"; do
    url="${BASE_URL}/${fname}"
    dest="${WWW_DIR}/${fname}"
    echo "  → ${fname}"
    if curl -fsSL --output "$dest" "$url"; then
        size=$(wc -c < "$dest" | tr -d ' ')
        ok "Saved to ${dest}  (${size} bytes)"
        DOWNLOADED+=("$fname")
    else
        warn "Failed to download ${fname} from ${url}"
        warn "Trying main branch as fallback..."
        fallback="https://raw.githubusercontent.com/${REPO}/main/custom_components/hive_trv_local/${fname}"
        if curl -fsSL --output "$dest" "$fallback"; then
            size=$(wc -c < "$dest" | tr -d ' ')
            ok "Saved from main branch: ${dest}  (${size} bytes)"
            DOWNLOADED+=("$fname")
        else
            err "Could not download ${fname} — check internet connectivity"
        fi
    fi
done

[[ ${#DOWNLOADED[@]} -eq 0 ]] && die "No card files downloaded — aborting"

# ── Register Lovelace resources ────────────────────────────────────────────────
section "Registering Lovelace resources"

python3 << PYEOF
import json, pathlib, shutil, sys, os

storage = pathlib.Path("${STORAGE_DIR}")
www     = pathlib.Path("${WWW_DIR}")
files   = [f for f in """${DOWNLOADED[*]}""".split() if f]

# Find the lovelace storage file
candidates = [
    storage / "lovelace",
    storage / "lovelace.default_view",
    storage / "lovelace_default_view",
    storage / "frontend.lovelace",
]
# Also search for any lovelace* file
if storage.exists():
    candidates += [f for f in storage.iterdir() if f.name.startswith("lovelace") and f not in candidates]

lv_file = next((c for c in candidates if c.exists()), None)

if lv_file is None:
    print("  ⚠  Lovelace storage file not found.")
    print("     This usually means you're using YAML-mode dashboards,")
    print("     or HA hasn't created the storage file yet.")
    print()
    print("  Add resources manually:")
    print("  Settings → Dashboards → ⋮ → Resources → Add")
    for f in files:
        print(f"    URL: /local/{f}   Type: JavaScript Module")
    sys.exit(0)

print(f"  Found: {lv_file}")

# Backup
backup = lv_file.with_suffix(".bak")
shutil.copy2(lv_file, backup)
print(f"  ✓  Backup saved to {backup.name}")

# Load and update
try:
    data = json.loads(lv_file.read_text())
except json.JSONDecodeError as e:
    print(f"  ✗  Could not parse {lv_file}: {e}")
    sys.exit(1)

config    = data.setdefault("data", {}).setdefault("config", {})
resources = config.setdefault("resources", [])
existing  = {r.get("url", "") for r in resources}

added = 0
for fname in files:
    url = f"/local/{fname}"
    if url not in existing:
        resources.append({"url": url, "type": "module"})
        print(f"  ✓  Registered: {url}")
        added += 1
    else:
        print(f"  ·  Already registered: {url}")

config["resources"] = resources
data["data"]["config"] = config

lv_file.write_text(json.dumps(data, indent=2))
if added:
    print(f"  ✓  Saved {lv_file.name} ({added} resource(s) added)")
else:
    print(f"  ✓  No changes needed — resources already registered")
PYEOF

PYEXIT=$?
if [[ $PYEXIT -ne 0 ]]; then
    warn "Resource registration encountered an issue (see above)"
    warn "You may need to add resources manually — instructions above"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
section "Done"

echo ""
echo -e "  ${GREEN}${BOLD}Files installed:${RESET}"
for fname in "${DOWNLOADED[@]}"; do
    echo -e "    ${GREEN}✓${RESET}  ${WWW_DIR}/${fname}"
done
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo "  1.  Restart Home Assistant"
echo "      Settings → System → Restart"
echo ""
echo "  2.  Hard-refresh your browser"
echo "      Windows/Linux:  Ctrl + Shift + R"
echo "      Mac:            Cmd  + Shift + R"
echo ""
echo "  3.  Add cards to any dashboard"
echo "      Dashboard → Edit → Add Card → search  Hive TRV"
echo ""
echo -e "  ${BOLD}Card YAML reference:${RESET}"
echo ""
echo "  Individual TRV (Zigbee2MQTT/MQTT entity):"
echo "    type: custom:hive-trv-card"
echo "    entity: climate.living_room_trv"
echo "    battery_entity: sensor.living_room_trv_battery        # optional"
echo "    demand_entity: sensor.living_room_trv_pi_heating_demand  # optional"
echo "    orientation_entity: select.living_room_trv_mounting_orientation  # optional"
echo ""
echo "  Room group (Hive TRV Local group entity):"
echo "    type: custom:hive-trv-group-card"
echo "    entity: climate.living_room"
echo ""
