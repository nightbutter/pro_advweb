// Coordinate parsing/validation for the HW-5 geographic search UI.

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Parse a latitude/longitude pair from free-form input.
 * Returns { coords } on success or { error } with a Thai message on failure.
 * Rejects empty input, non-numeric text, NaN/Infinity, and out-of-range values.
 */
export function parseCoordinates(
  latInput: unknown,
  lngInput: unknown
): { coords: Coordinates } | { error: string } {
  if (latInput === '' || latInput === null || latInput === undefined ||
      lngInput === '' || lngInput === null || lngInput === undefined) {
    return { error: 'กรุณากรอกละติจูดและลองจิจูด' };
  }
  const lat = Number(latInput);
  const lng = Number(lngInput);
  if (!Number.isFinite(lat)) {
    return { error: 'ละติจูดต้องเป็นตัวเลข' };
  }
  if (!Number.isFinite(lng)) {
    return { error: 'ลองจิจูดต้องเป็นตัวเลข' };
  }
  if (lat < -90 || lat > 90) {
    return { error: 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90' };
  }
  if (lng < -180 || lng > 180) {
    return { error: 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180' };
  }
  return { coords: { lat, lng } };
}
