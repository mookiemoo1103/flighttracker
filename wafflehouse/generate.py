#!/usr/bin/env python3
"""Build the nationwide Waffle House AquaCeroWx / GRLevelX placefile."""
import concurrent.futures
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "wafflehouse.txt"
ASSET_DIR = ROOT / "assets"
LOGO = ASSET_DIR / "waffle-house.png"

LOCATOR_URL = "https://locations.wafflehouse.com/"
SITEMAP_URL = "https://locations.wafflehouse.com/sitemap.xml"
LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/f/fd/Waffle_House_Logo_%28Alternate%29.png"
ICON_URL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/wafflehouse/assets/waffle-house.png"
USER_AGENT = "AquaCeroWx-WaffleHouse-Placefile/1.0 (GitHub Actions)"
MIN_EXPECTED_LOCATIONS = 1000


def get(url, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip().replace('"', "'")


def walk(obj):
    if isinstance(obj, dict):
        yield obj
        for value in obj.values():
            yield from walk(value)
    elif isinstance(obj, list):
        for value in obj:
            yield from walk(value)


def from_locator_json():
    page = get(LOCATOR_URL).decode("utf-8", errors="replace")
    match = re.search(
        r"<script[^>]+id=['\"]__NEXT_DATA__['\"][^>]*>(.*?)</script>",
        page, re.DOTALL
    )
    if not match:
        return []
    payload = json.loads(match.group(1))
    for obj in walk(payload):
        values = obj.get("locations")
        if isinstance(values, list) and values and isinstance(values[0], dict):
            if "latitude" in values[0] or "lat" in values[0]:
                return [normalize_location(item) for item in values]
    return []


def sitemap_urls():
    root = ET.fromstring(get(SITEMAP_URL))
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [node.text.strip() for node in root.findall(".//sm:loc", ns) if node.text]
    if root.tag.endswith("sitemapindex"):
        expanded = []
        for sitemap in urls:
            try:
                sub = ET.fromstring(get(sitemap))
                expanded.extend(node.text.strip() for node in sub.findall(".//sm:loc", ns) if node.text)
            except Exception as exc:
                print(f"Could not read sitemap {sitemap}: {exc}")
        urls = expanded
    return sorted(set(
        url for url in urls
        if urlparse(url).netloc.lower().endswith("wafflehouse.com")
        and urlparse(url).path.strip("/")
        and "sitemap" not in urlparse(url).path.lower()
    ))


def normalize_location(item):
    if not isinstance(item, dict):
        return None
    geo = item.get("geo") or {}
    address_obj = item.get("address") or {}
    if not isinstance(address_obj, dict):
        address_obj = {}
    try:
        lat = float(item.get("latitude", item.get("lat", geo.get("latitude"))))
        lon = float(item.get("longitude", item.get("lng", item.get("lon", geo.get("longitude")))))
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    store = clean(item.get("storeCode") or item.get("storeNumber") or item.get("identifier"))
    name = clean(item.get("businessName") or item.get("name") or "Waffle House")
    raw_address = item.get("addressLines") or item.get("streetAddress") or address_obj.get("streetAddress") or ""
    if isinstance(raw_address, list):
        address = clean(", ".join(str(x) for x in raw_address if x))
    else:
        address = clean(raw_address)
    city = clean(item.get("city") or address_obj.get("addressLocality"))
    state = clean(item.get("state") or address_obj.get("addressRegion"))
    postal = clean(item.get("postalCode") or address_obj.get("postalCode"))
    place_url = clean(item.get("localPageUrl") or item.get("url"))
    if place_url.startswith("/"):
        place_url = "https://locations.wafflehouse.com" + place_url
    label = name if name.lower().startswith("waffle house") else (
        f"Waffle House #{store}" if store else "Waffle House"
    )
    details = [label, address, ", ".join(x for x in (city, state, postal) if x)]
    if place_url.startswith("http"):
        details.append(place_url)
    return lat, lon, "\n".join(x for x in details if x)


def parse_location_page(url):
    try:
        page = get(url, timeout=25).decode("utf-8", errors="replace")
        scripts = re.findall(
            r"<script[^>]*type=['\"]application/ld\+json['\"][^>]*>(.*?)</script>",
            page, re.DOTALL | re.IGNORECASE
        )
        for raw in scripts:
            try:
                data = json.loads(html.unescape(raw))
            except (ValueError, TypeError):
                continue
            for obj in walk(data):
                normalized = normalize_location(obj)
                if normalized:
                    lat, lon, tooltip = normalized
                    if "waffle" in tooltip.lower():
                        return normalized
        # Some locator builds expose coordinates in embedded page JSON, not JSON-LD.
        for match in re.finditer(r"<script[^>]*>(.*?)</script>", page, re.DOTALL):
            raw = match.group(1)
            if "latitude" not in raw or "longitude" not in raw:
                continue
            try:
                data = json.loads(raw)
            except (ValueError, TypeError):
                continue
            for obj in walk(data):
                normalized = normalize_location(obj)
                if normalized:
                    return normalized
    except Exception as exc:
        print(f"Location page failed: {url}: {exc}")
    return None


def main():
    locations = from_locator_json()
    locations = [item for item in locations if item]
    if len(locations) < MIN_EXPECTED_LOCATIONS:
        print("Embedded locator data unavailable/incomplete; falling back to official sitemap.")
        urls = sitemap_urls()
        print(f"Found {len(urls)} official location pages in sitemap.")
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
            results = list(pool.map(parse_location_page, urls))
        locations = [item for item in results if item]

    records = {}
    for lat, lon, tooltip in locations:
        records[(round(lat, 6), round(lon, 6))] = (lat, lon, tooltip)

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
        safe_tooltip = tooltip.replace("\\", "/").replace('"', "'").replace("\r", "").replace("\n", "\\n")
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
