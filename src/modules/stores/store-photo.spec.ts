import { normalizeStoreCode } from './store-code';
import { detectStorePhotoExtension } from './store-photo';

const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('detectStorePhotoExtension', () => {
  it('reads JPG, PNG and WebP from their first bytes', () => {
    expect(detectStorePhotoExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpg');
    expect(detectStorePhotoExtension(PNG_PIXEL)).toBe('png');
    expect(detectStorePhotoExtension(Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe('webp');
  });

  it('rejects anything else, whatever the file claims to be', () => {
    expect(detectStorePhotoExtension(Buffer.from('GIF89a', 'ascii'))).toBeNull();
    expect(detectStorePhotoExtension(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8'))).toBeNull();
    expect(detectStorePhotoExtension(Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'))).toBeNull();
    expect(detectStorePhotoExtension(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectStorePhotoExtension(Buffer.alloc(0))).toBeNull();
  });
});

describe('normalizeStoreCode', () => {
  it('trims and ignores case', () => {
    expect(normalizeStoreCode('  muji-nuvali ')).toBe('MUJI-NUVALI');
    expect(normalizeStoreCode('MUJI-NUVALI')).toBe('MUJI-NUVALI');
  });
});
