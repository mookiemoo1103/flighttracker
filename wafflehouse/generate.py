#!/usr/bin/env python3
"""Build the nationwide Waffle House AquaCeroWx / GRLevelX placefile."""
import html
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "wafflehouse.txt"
ASSET_DIR = ROOT / "assets"
LOGO = ASSET_DIR / "waffle-house.png"

LOCATOR_URL = "https://locations.wafflehouse.com/"
LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/f/fd/Waffle_House_Logo_%28Alternate%29.png"
ICON_URL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/wafflehouse/assets/waffle-house.png"
USER_AGENT = "AquaCeroWx-WaffleHouse-Placefile/1.0 (GitHub Actions)"
MIN_EXPECTED_LOCATIONS = 1000


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read()


def find_locations(obj):
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key == "locations" and isinstance(value, list) and value:
                sample = value[0]
                if isinstance(sample, dict) and ("latitude" in sample or "lat" in sample):
                    return value
        for value in obj.values():
            found = find_locations(value)
            if found:
                return found
    elif isinstance(obj, list):
        for value in obj:
            found = find_locations(value)
            if found:
                return found
    return None


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip().replace('"', "'")


def main():
    page = get(LOCATOR_URL).decode("utf-8", errors="replace")
    match = re.search(
        r"<script[^>]+id=['\"]__NEXT_DATA__['\"][^>]*>(.*?)</script>",
        page, re.DOTALL
    )
    if not match:
        raise RuntimeError("Official Waffle House locator did not expose its location data.")
    payload = json.loads(match.group(1))
    locations = find_locations(payload)
    if not locations:
        raise RuntimeError("Could not find the locations array in the official locator data.")

    records = {}
    for item in locations:
        try:
            lat = float(item.get("latitude", item.get("lat")))
            lon = float(item.get("longitude", item.get("lng", item.get("lon"))))
        except (TypeError, ValueError):
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        store = clean(item.get("storeCode") or item.get("storeNumber") or item.get("id"))
        name = clean(item.get("businessName") or item.get("name") or "Waffle House")
        address_lines = item.get("addressLines") or []
        address = clean(", ".join(str(x) for x in address_lines if x))
        city = clean(item.get("city"))
        state = clean(item.get("state"))
        postal = clean(item.get("postalCode"))
        place_url = clean(item.get("localPageUrl") or item.get("url"))
        if place_url.startswith("/"):
            place_url = "https://locations.wafflehouse.com" + place_url
        label = name if name.lower().startswith("waffle house") else (
            f"Waffle House #{store}" if store else "Waffle House"
        )
        details = [label, address, ", ".join(x for x in (city, state, postal) if x)]
        if place_url:
            details.append(place_url)
        records[(round(lat, 6), round(lon, 6))] = (lat, lon, "\n".join(x for x in details if x))

    if len(records) < MIN_EXPECTED_LOCATIONS:
        raise RuntimeError(
            f"Only {len(records)} geocoded locations found; refusing to overwrite "
            f"the last good placefile (minimum {MIN_EXPECTED_LOCATIONS})."
        )

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    png = get(LOGO_URL)
    if not png.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Waffle House logo download was not a valid PNG.")
    LOGO.write_bytes(png)

    lines = [
        "; Waffle House locations from the official Waffle House locator",
        "; Logo artwork: Wikimedia Commons, Waffle House Logo (Alternate).png",
        "Title: WAFFLE HOUSE - UNITED STATES",
        "Refresh: 1",
        "Color: 0 0 0",
        'Font: 1, 10, 1, "Arial"',
        f'IconFile: 1, 32, 32, 16, 16, "{ICON_URL}"',
        f"; Locations: {len(records)}",
    ]
    for lat, lon, tooltip in sorted(records.values(), key=lambda row: (row[0], row[1])):
        safe_tooltip = tooltip.replace("\\", "/").replace('"', "'")
        lines.extend([
            f"Object: {lat:.6f},{lon:.6f}",
            "Threshold: 999",
            f'Icon: 0,0,0,1,1,"{safe_tooltip}"',
            "End:",
        ])

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Generated {OUT} with {len(records)} Waffle House locations.")


if __name__ == "__main__":
    main()
