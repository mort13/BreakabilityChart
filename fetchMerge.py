import json
import os

# Folder where your JSON files live
DATA_DIR = "data"

# Categories and file names
categories = {
    "laserheads": {"items": "laserheads.json", "attrs": "laserheads_attributes.json"},
    "modules": {"items": "modules.json", "attrs": "modules_attributes.json"},
    "gadgets": {"items": "gadgets.json", "attrs": "gadgets_attributes.json"}
}

# Helper to load JSON
def load_json(filename):
    with open(os.path.join(DATA_DIR, filename), "r", encoding="utf-8") as f:
        return json.load(f)["data"]

# Merge attributes into items
def merge_attributes(items, attributes):
    attr_by_item_id = {}
    for attr in attributes:
        attr_by_item_id.setdefault(attr["id_item"], []).append(attr)
    
    merged = []
    for item in items:
        item_copy = item.copy()
        item_copy["attributes"] = attr_by_item_id.get(item["id"], [])
        merged.append(item_copy)
    return merged

# Process each category
for cat_name, files in categories.items():
    items = load_json(files["items"])
    attrs = load_json(files["attrs"])
    
    merged = merge_attributes(items, attrs)
    
    output_file = os.path.join(DATA_DIR, f"{cat_name}_merged.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2)
    
    print(f"Merged {cat_name} saved to {output_file}")
