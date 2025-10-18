import requests
import json
import os

TOKEN = input()
OUTPUT_DIR = "data"
os.makedirs(OUTPUT_DIR, exist_ok=True)

categories = {
    28: "gadgets",
    29: "laserheads",
    30: "modules"
}

BASE_URL = "https://api.uexcorp.uk/2.0/items_attributes"

headers = {
    "Authorization": f"Bearer {TOKEN}"
}

for cat_id, name in categories.items():
    print(f"Fetching attributes for category {cat_id}: {name}")
    response = requests.get(BASE_URL, headers=headers, params={"id_category": cat_id})
    if response.status_code == 200:
        data = response.json()
        with open(os.path.join(OUTPUT_DIR, f"{name}_attributes.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Saved {name}_attributes.json")
    else:
        print(f"Failed to fetch {name} attributes: {response.status_code} {response.text}")
