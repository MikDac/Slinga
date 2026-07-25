import { describe, expect, it } from 'vitest';
import { toGpx } from '../src/gpx.js';

describe('toGpx', () => {
  it('produces a GPX 1.1 track with all points', () => {
    const gpx = toGpx({
      name: 'Munich 8k loop',
      coordinates: [
        [11.5755, 48.1374],
        [11.58, 48.14, 520.4],
      ],
    });
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<name>Munich 8k loop</name>');
    expect(gpx.match(/<trkpt /g)).toHaveLength(2);
    expect(gpx).toContain('lat="48.1374" lon="11.5755"');
    expect(gpx).toContain('<ele>520.4</ele>');
  });

  it('escapes XML in names', () => {
    const gpx = toGpx({ name: 'A <fast> & "fun" run', coordinates: [[11.57, 48.13]] });
    expect(gpx).toContain('A &lt;fast&gt; &amp; &quot;fun&quot; run');
    expect(gpx).not.toContain('<fast>');
  });
});
