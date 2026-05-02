/**
 * Coordinate conversion utilities
 * Used for converting between client coordinates, normalized coordinates, and device coordinates
 */

/**
 * Convert client coordinates to normalized coordinates (0-1)
 * @param clientX Client X coordinate
 * @param clientY Client Y coordinate
 * @param element Target HTML element
 * @returns Normalized coordinates { x, y }, range [0, 1]
 */
export function clientToNormalized(
  clientX: number,
  clientY: number,
  element: HTMLElement
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  
  // Calculate coordinates relative to the element
  const relativeX = clientX - rect.left;
  const relativeY = clientY - rect.top;
  
  // Normalize to 0-1 range and clamp within valid bounds
  const x = Math.max(0, Math.min(1, relativeX / rect.width));
  const y = Math.max(0, Math.min(1, relativeY / rect.height));
  
  return { x, y };
}

/**
 * Convert normalized coordinates to device pixel coordinates
 * @param normalizedX Normalized X coordinate (0-1)
 * @param normalizedY Normalized Y coordinate (0-1)
 * @param deviceWidth Device width (pixels)
 * @param deviceHeight Device height (pixels)
 * @param rotation Device rotation angle (0, 1, 2, 3 corresponding to 0°, 90°, 180°, 270°)
 * @returns Device pixel coordinates { x, y }
 */
export function normalizedToDevice(
  normalizedX: number,
  normalizedY: number,
  deviceWidth: number,
  deviceHeight: number,
  rotation: number = 0
): { x: number; y: number } {
  let x: number;
  let y: number;

  // Convert coordinates based on rotation angle
  switch (rotation) {
    case 0: // 0° - Normal orientation
      x = normalizedX * deviceWidth;
      y = normalizedY * deviceHeight;
      break;
    case 1: // 90° - Clockwise rotation
      x = normalizedY * deviceWidth;
      y = (1 - normalizedX) * deviceHeight;
      break;
    case 2: // 180° - Inverted
      x = (1 - normalizedX) * deviceWidth;
      y = (1 - normalizedY) * deviceHeight;
      break;
    case 3: // 270° - Counter-clockwise rotation
      x = (1 - normalizedY) * deviceWidth;
      y = normalizedX * deviceHeight;
      break;
    default:
      x = normalizedX * deviceWidth;
      y = normalizedY * deviceHeight;
  }

  // Ensure coordinates are within device bounds
  x = Math.max(0, Math.min(deviceWidth, Math.round(x)));
  y = Math.max(0, Math.min(deviceHeight, Math.round(y)));

  return { x, y };
}

/**
 * Validate if normalized coordinates are within valid range
 * @param x Normalized X coordinate
 * @param y Normalized Y coordinate
 * @returns Whether valid
 */
export function isValidNormalizedCoord(x: number, y: number): boolean {
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    !isNaN(x) &&
    !isNaN(y) &&
    x >= 0 &&
    x <= 1 &&
    y >= 0 &&
    y <= 1
  );
}
