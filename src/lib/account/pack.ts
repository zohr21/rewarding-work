/**
 * Big stores are sent to the account gzipped. The account's rules take at most 800 000
 * characters per store (firestore.rules), and Budget grows every day bank alerts come in.
 * Its JSON shrinks to about a tenth, so years more fit.
 *
 * Only a store too big to send as it is gets packed: an older app reading a packed copy can't
 * read it, but a store that big could not reach the account from that app either.
 */

/** The longest store sent as plain JSON. */
export const PLAIN_MAX = 700_000;
/** What firestore.rules lets through. */
export const SEND_MAX = 800_000;

const PREFIX = 'gz1:';

export const isPacked = (data: string) => data.startsWith(PREFIX);

const canPack = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  // In parts: one call with a whole store's bytes would overflow the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

/** The text to send for `json`: itself while it is small enough, else packed. */
export async function pack(json: string): Promise<string> {
  if (json.length <= PLAIN_MAX || !canPack()) return json;
  const zipped = await through(new TextEncoder().encode(json), new CompressionStream('gzip'));
  return PREFIX + toBase64(zipped);
}

/** The JSON a sent text holds; null when it can't be read. */
export async function unpack(data: string): Promise<string | null> {
  if (!isPacked(data)) return data;
  if (!canPack()) return null;
  try {
    const bytes = await through(fromBase64(data.slice(PREFIX.length)), new DecompressionStream('gzip'));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
