# OCR Character Templates

Place your character template images here. Each image should contain a single character as it appears in the game.

## Required Files

- `0.png` - The digit 0
- `1.png` - The digit 1
- `2.png` - The digit 2
- `3.png` - The digit 3
- `4.png` - The digit 4
- `5.png` - The digit 5
- `6.png` - The digit 6
- `7.png` - The digit 7
- `8.png` - The digit 8
- `9.png` - The digit 9
- `dot.png` - The decimal point (.)
- `percent.png` - The percent sign (%)

## Guidelines

1. **Crop tightly** - Each character should fill most of the image with minimal padding
2. **Consistent size** - All digits should ideally be the same height
3. **High contrast** - Light text on dark background, or vice versa
4. **Clean capture** - Take screenshots at the same resolution you'll be using for capture

## How to Create Templates

1. Take a screenshot of the game showing the values you want to capture
2. Zoom in and crop each character individually
3. Save as PNG with transparent or solid background
4. Name according to the list above

## Tips

- The OCR works best when the captured text matches the template exactly
- If recognition is poor, try adjusting the threshold in `ocr-manager.js`
- Larger templates generally work better than very small ones
