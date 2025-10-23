import json
import os
import re

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

# Split Mining Laser Power into Min and Max attributes
def split_laser_power_attributes(attributes):
    """
    Splits "Mining Laser Power" range attributes (e.g., "189-1890")
    into separate "Minimum Laser Power" and "Maximum Laser Power" attributes.
    Preserves the id_item association.
    """
    new_attributes = []
    
    for attr in attributes:
        new_attributes.append(attr)
        
        # Check if this is Mining Laser Power with a range value
        if attr.get("attribute_name") == "Mining Laser Power":
            value = attr.get("value", "")
            # Match range pattern like "189-1890"
            match = re.match(r'^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$', value)
            if match:
                min_val = match.group(1)
                max_val = match.group(2)
                
                # Create Minimum Laser Power attribute (preserving id_item)
                min_attr = {
                    "attribute_name": "Minimum Laser Power",
                    "value": min_val,
                    "unit": "MW",
                    "id_item": attr.get("id_item")  # Preserve the item association
                }
                new_attributes.append(min_attr)
                
                # Create Maximum Laser Power attribute (preserving id_item)
                max_attr = {
                    "attribute_name": "Maximum Laser Power",
                    "value": max_val,
                    "unit": "MW",
                    "id_item": attr.get("id_item")  # Preserve the item association
                }
                new_attributes.append(max_attr)
    
    return new_attributes

# Merge attributes into items
def merge_attributes(items, attributes):
    attr_by_item_id = {}
    for attr in attributes:
        attr_by_item_id.setdefault(attr["id_item"], []).append(attr)
    
    merged = []
    for item in items:
        item_copy = item.copy()
        item_attrs = attr_by_item_id.get(item["id"], [])
        # Split laser power attributes
        item_attrs = split_laser_power_attributes(item_attrs)
        item_copy["attributes"] = item_attrs
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
