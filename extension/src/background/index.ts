import { addCapture, db } from '../db';
import { isNeoCaptureMessage, NEO_CAPTURE_MESSAGE_TYPE, CapturedRequest } from '../types';

const tabCaptureCounts = new Map<number, number>();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!isNeoCaptureMessage(message)) {
    return;
  }

  const incoming = message.payload;
  const tabId = typeof incoming.tabId === 'number'
    ? incoming.tabId
    : sender.tab?.id ?? -1;

  const capture: CapturedRequest = {
    ...incoming,
    tabId,
    tabUrl: incoming.tabUrl || sender.tab?.url || '',
  };

  void persistCapture(capture);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void refreshBadge(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCaptureCounts.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  void hydrateCounts();
});

chrome.runtime.onStartup.addListener(() => {
  void hydrateCounts();
});

void hydrateCounts();

async function hydrateCounts(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (typeof tab.id !== 'number') {
        continue;
      }

      const count = await db.capturedRequests
        .where('tabId')
        .equals(tab.id)
        .count();

      if (count > 0) {
        tabCaptureCounts.set(tab.id, count);
      }
    }

    await refreshBadge();
  } catch (err) {
    console.error('[Neo] hydrateCounts failed:', err);
  }
}

async function refreshBadge(tabId?: number): Promise<void> {
  const targetTabId = typeof tabId === 'number' && tabId > 0 ? tabId : await getActiveTabId();
  if (typeof targetTabId !== 'number' || targetTabId < 0) {
    return;
  }

  const count = tabCaptureCounts.get(targetTabId)
    ?? await db.capturedRequests.where('tabId').equals(targetTabId).count();

  tabCaptureCounts.set(targetTabId, count);
  await chrome.action.setBadgeText({
    tabId: targetTabId,
    text: count > 0 ? String(count) : '',
  });

  await chrome.action.setBadgeBackgroundColor({
    color: '#2563EB',
    tabId: targetTabId,
  });
}

async function getActiveTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function persistCapture(capture: CapturedRequest): Promise<void> {
  try {
    await addCapture(capture);

    if (capture.tabId > -1) {
      const existing = tabCaptureCounts.get(capture.tabId) || 0;
      tabCaptureCounts.set(capture.tabId, existing + 1);
    }

    await refreshBadge(capture.tabId);
  } catch (err) {
    console.error('[Neo] persistCapture failed:', err);
  }
}

console.log(NEO_CAPTURE_MESSAGE_TYPE);
