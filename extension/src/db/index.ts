import Dexie from 'dexie';
import type { CapturedRequest, CapturedRequestRecord } from '../types';
import { MAX_CAPTURE_BODY_BYTES, MAX_CAPTURES_PER_DOMAIN } from '../types';

export { truncateText, normalizeCaptureValue } from '../utils';

export class NeoDatabase extends Dexie {
  capturedRequests!: Dexie.Table<CapturedRequestRecord, string>;

  constructor() {
    super('neo-capture-v01');
    this.version(1).stores({
      capturedRequests: 'id, tabId, domain, timestamp, method, [domain+timestamp]',
    });
  }
}

export const db = new NeoDatabase();

export async function addCapture(record: CapturedRequest): Promise<string> {
  const result = await db.capturedRequests.add({ ...record, createdAt: Date.now() });
  
  // Enforce per-domain cap: delete oldest if over limit
  void enforceDomainCap(record.domain);
  
  return result;
}

async function enforceDomainCap(domain: string): Promise<void> {
  try {
    const count = await db.capturedRequests.where('domain').equals(domain).count();
    if (count <= MAX_CAPTURES_PER_DOMAIN) return;
    
    const excess = count - MAX_CAPTURES_PER_DOMAIN;
    const oldest = await db.capturedRequests
      .where('[domain+timestamp]')
      .between([domain, Dexie.minKey], [domain, Dexie.maxKey])
      .limit(excess)
      .toArray();
    
    const idsToDelete = oldest.map(r => r.id);
    if (idsToDelete.length > 0) {
      await db.capturedRequests.bulkDelete(idsToDelete);
    }
  } catch {
    // Non-critical, silently ignore cleanup errors
  }
}

