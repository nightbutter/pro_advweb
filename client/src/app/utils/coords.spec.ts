import { parseCoordinates } from './coords';

describe('parseCoordinates', () => {
  it('accepts valid coordinates', () => {
    const res = parseCoordinates('16.2465', '103.2505');
    expect('coords' in res && res.coords.lat).toBe(16.2465);
    expect('coords' in res && res.coords.lng).toBe(103.2505);
  });

  it('accepts boundary values', () => {
    expect('coords' in parseCoordinates('90', '180')).toBeTrue();
    expect('coords' in parseCoordinates('-90', '-180')).toBeTrue();
  });

  it('rejects empty inputs', () => {
    expect('error' in parseCoordinates('', '103')).toBeTrue();
    expect('error' in parseCoordinates('16.2', '')).toBeTrue();
    expect('error' in parseCoordinates('', '')).toBeTrue();
  });

  it('rejects non-numeric input', () => {
    expect('error' in parseCoordinates('abc', '103')).toBeTrue();
    expect('error' in parseCoordinates('16.2', 'xyz')).toBeTrue();
  });

  it('rejects NaN and Infinity', () => {
    expect('error' in parseCoordinates('NaN', '103')).toBeTrue();
    expect('error' in parseCoordinates('16.2', 'Infinity')).toBeTrue();
  });

  it('rejects latitude out of -90..90', () => {
    expect('error' in parseCoordinates('90.1', '103')).toBeTrue();
    expect('error' in parseCoordinates('-91', '103')).toBeTrue();
  });

  it('rejects longitude out of -180..180', () => {
    expect('error' in parseCoordinates('16.2', '180.5')).toBeTrue();
    expect('error' in parseCoordinates('16.2', '-181')).toBeTrue();
  });

  it('does not swap lat/lng', () => {
    const res = parseCoordinates('16.2465', '103.2505');
    if ('coords' in res) {
      expect(res.coords.lat).toBe(16.2465);
      expect(res.coords.lng).toBe(103.2505);
    }
  });
});
