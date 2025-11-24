import json
import os

# Path to the modules_merged.json file
MODULES_FILE = os.path.join('data', 'modules_merged.json')

def load_modules():
    """Load the modules from the JSON file."""
    with open(MODULES_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_modules(modules):
    """Save the modules back to the JSON file."""
    with open(MODULES_FILE, 'w', encoding='utf-8') as f:
        json.dump(modules, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved changes to {MODULES_FILE}")

def add_tier_to_module(module_name, tier):
    """Add a tier attribute to a specific module by name."""
    modules = load_modules()
    
    # Find the module by name
    module_found = False
    for module in modules:
        if module['name'] == module_name:
            module_found = True
            
            # Check if tier attribute already exists
            tier_attr = next((attr for attr in module['attributes'] if attr['attribute_name'] == 'Tier'), None)
            
            if tier_attr:
                old_tier = tier_attr['value']
                tier_attr['value'] = str(tier)
                print(f"✓ Updated '{module_name}': Tier {old_tier} → {tier}")
            else:
                # Add new tier attribute
                module['attributes'].append({
                    'attribute_name': 'Tier',
                    'value': str(tier),
                    'unit': ''
                })
                print(f"✓ Added Tier {tier} to '{module_name}'")
            
            break
    
    if not module_found:
        print(f"✗ Module '{module_name}' not found!")
        return False
    
    save_modules(modules)
    return True

def bulk_add_tiers(tier_mapping):
    """Add tiers to multiple modules at once.
    
    Args:
        tier_mapping: Dictionary with module names as keys and tiers as values
                     Example: {'Module Name 1': 1, 'Module Name 2': 2}
    """
    modules = load_modules()
    changes_made = 0
    
    for module_name, tier in tier_mapping.items():
        module_found = False
        
        for module in modules:
            if module['name'] == module_name:
                module_found = True
                
                # Check if tier attribute already exists
                tier_attr = next((attr for attr in module['attributes'] if attr['attribute_name'] == 'Tier'), None)
                
                if tier_attr:
                    old_tier = tier_attr['value']
                    tier_attr['value'] = str(tier)
                    print(f"✓ Updated '{module_name}': Tier {old_tier} → {tier}")
                else:
                    # Add new tier attribute
                    module['attributes'].append({
                        'attribute_name': 'Tier',
                        'value': str(tier),
                        'unit': ''
                    })
                    print(f"✓ Added Tier {tier} to '{module_name}'")
                
                changes_made += 1
                break
        
        if not module_found:
            print(f"✗ Module '{module_name}' not found!")
    
    if changes_made > 0:
        save_modules(modules)
        print(f"\n✓ Successfully updated {changes_made} module(s)")
    else:
        print("\n✗ No changes were made")

def list_passive_modules():
    """List all passive modules (for reference)."""
    modules = load_modules()
    
    passive_modules = []
    for module in modules:
        is_passive = any(
            attr['attribute_name'] == 'Item Type' and attr['value'] == 'Passive'
            for attr in module['attributes']
        )
        if is_passive:
            # Check if tier already exists
            tier_attr = next((attr for attr in module['attributes'] if attr['attribute_name'] == 'Tier'), None)
            tier = tier_attr['value'] if tier_attr else 'No tier'
            passive_modules.append((module['name'], tier))
    
    print("\nPassive Modules:")
    print("-" * 60)
    for name, tier in sorted(passive_modules):
        print(f"  {name:<50} Tier: {tier}")
    print(f"\nTotal: {len(passive_modules)} passive modules")

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) == 1:
        print("Usage:")
        print("  python addTierToModule.py list                    - List all passive modules")
        print("  python addTierToModule.py 'Module Name' <tier>   - Add tier to a single module")
        print("  python addTierToModule.py bulk                    - Add tiers to multiple modules")
        print("\nFor bulk mode, edit the tier_mapping dictionary in the script.")
        sys.exit(0)
    
    command = sys.argv[1]
    
    if command == 'list':
        list_passive_modules()
    
    elif command == 'bulk':
        # EDIT THIS DICTIONARY TO ADD TIERS TO MULTIPLE MODULES AT ONCE
        tier_mapping = {
            "FLTR Module": 1,
            "FLTR-L Module": 2,
            "FLTR-XL Module": 3,
            "Focus Module": 1,
            "Focus II Module": 2,
            "Focus III Module": 3,
            "Rieger Module": 1,
            "Rieger-C2 Module": 2,
            "Rieger-C3 Module": 3,
            "Torrent Module": 1,
            "Torrent II Module": 2,
            "Torrent III Module": 3,
            "Vaux Module": 1,
            "Vaux-C2 Module": 2,
            "Vaux-C3 Module": 3,
            "XTR Module": 1,
            "XTR-L Module": 2,
            "XTR-XL Module": 3,
            # Example:
            # 'Arbor MH1 Mining Module': 1,
            # 'Arbor MH2 Mining Module': 2,
        }
        
        if not tier_mapping:
            print("Please edit the tier_mapping dictionary in the script first!")
            print("Example:")
            print("  tier_mapping = {")
            print("      'Module Name 1': 1,")
            print("      'Module Name 2': 2,")
            print("  }")
        else:
            bulk_add_tiers(tier_mapping)
    
    elif len(sys.argv) == 3:
        module_name = sys.argv[1]
        tier = sys.argv[2]
        
        try:
            tier = int(tier)
            add_tier_to_module(module_name, tier)
        except ValueError:
            print(f"Error: Tier must be a number, got '{tier}'")
    
    else:
        print("Invalid arguments. Use 'python addTierToModule.py' for usage info.")
