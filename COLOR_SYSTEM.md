# Color System Documentation

## Overview
All colors are centralized using CSS custom properties (variables) at the top of `style.css`. This makes it easy to adjust the entire color scheme by changing values in one place.

## Color Variables

### Text Colors
- `--color-text-primary`: Main text, names, labels (attribute names, module names, etc.)
- `--color-text-values`: Values and units (numbers and their units)
- `--color-text-muted`: Secondary/muted text

### Background Colors
- `--color-bg-main`: Main page background
- `--color-bg-card`: Cards background (laserhead cards, module cards)
- `--color-bg-highlight`: Sub-elements background (module slots inside selected laserhead)

### Button Colors
- `--color-btn-add`: Add buttons
- `--color-btn-add-hover`: Add buttons on hover
- `--color-btn-replace`: Replace buttons
- `--color-btn-replace-hover`: Replace buttons on hover
- `--color-btn-delete`: Delete/Remove buttons
- `--color-btn-delete-hover`: Delete/Remove buttons on hover
- `--color-btn-default`: Default buttons
- `--color-btn-default-hover`: Default buttons on hover

### UI Colors
- `--color-border`: Standard borders
- `--color-border-light`: Light borders (table rows)
- `--color-accent`: Accent color (active elements, highlights)

## Light Mode Values
```css
--color-text-primary: #333
--color-text-values: #000
--color-bg-main: #ffffff
--color-bg-card: #f8f9fa
--color-bg-highlight: #fff
--color-btn-add: #28a745 (green)
--color-btn-replace: #007bff (blue)
--color-btn-delete: #dc3545 (red)
--color-btn-default: #eee
--color-border: #ddd
```

## Dark Mode Values
```css
--color-text-primary: #e0e0e0
--color-text-values: #e0e0e0
--color-bg-main: #1a1a1a
--color-bg-card: #2a2a2a
--color-bg-highlight: #333
--color-btn-add: #28a745 (green)
--color-btn-replace: #007bff (blue)
--color-btn-delete: #dc3545 (red)
--color-btn-default: #333
--color-border: #444
```

## How to Change Colors

### To change a specific color globally:
1. Open `style.css`
2. Find the `:root` block (lines 1-25) for light mode
3. Find the `body.dark-mode` block (lines 27-52) for dark mode
4. Change the hex value for the desired variable

### Examples:

#### Make attribute names blue:
```css
--color-text-primary: #007bff;
```

#### Make values green:
```css
--color-text-values: #28a745;
```

#### Change add button to purple:
```css
--color-btn-add: #6f42c1;
--color-btn-add-hover: #5a32a3;
```

## Elements Using Each Color

### `--color-text-primary` is used for:
- Attribute names (.attr-name)
- Module names (.module-name)
- Card titles (.name)
- Slot numbers (.slot-number)
- All h1-h6 headings
- All labels

### `--color-text-values` is used for:
- Numeric values (.value-number)
- Units (.value-unit)

### `--color-bg-card` is used for:
- Laserhead cards (.laserhead-card)
- Module cards (.laser-card)
- Selected laserhead container (.selected-laserhead)

### `--color-bg-highlight` is used for:
- Module slots inside selected laserhead (.module-slot)

### Button colors are applied to:
- Add buttons: `.add-module-btn`, buttons with "add" in ID
- Replace buttons: `.replace-module-btn`
- Delete buttons: `.remove-module-btn`, `.remove-laserhead-btn`, buttons with "remove"/"delete" in ID
