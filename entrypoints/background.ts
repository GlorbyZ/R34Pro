console.log("[R34Pro] Background: Engine Booting v1.7.0");

type QueueState = {
  isDownloading: boolean;
  progress: number;
  total: number;
  tags: string;
  cancelRequested: boolean;
};

const queueState: QueueState = {
  isDownloading: false,
  progress: 0,
  total: 0,
  tags: '',
  cancelRequested: false
};

const RULE34_ORIGIN = 'https://rule34.xxx';

async function updateState(updates: Partial<QueueState>) {
  Object.assign(queueState, updates);
  try {
    await chrome.storage.local.set({ bulkQueueState: queueState });
  } catch (e) {
    console.warn("[R34Pro] Background: Storage sync failed", e);
  }
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse: (r: any) => void) => {
    switch (message.type) {
      case 'DOWNLOAD':
        handleSingleDownload(message.url, message.filename);
        sendResponse({ status: 'queued' });
        break;

      case 'GET_QUEUE_STATUS':
        sendResponse(queueState);
        break;

      case 'CANCEL_QUEUE':
        queueState.cancelRequested = true;
        chrome.storage.local.set({ bulkQueueState: { ...queueState, isDownloading: false } });
        sendResponse({ status: 'cancelled' });
        break;

      case 'START_QUEUE':
        console.log("[R34Pro] Background: START_QUEUE command accepted", message);
        // Start logic
        startBulkQueue(message.tags, message.startId, message.count).catch(e => {
            console.error("[R34Pro] Background: Bulk Queue FATAL exception", e);
            chrome.storage.local.set({ bulkQueueState: { ...queueState, isDownloading: false } });
        });
        sendResponse({ status: 'started', acknowledged: true });
        break;
    }
    return true;
  });
});

function handleSingleDownload(url: string, filename?: string) {
  try {
    const finalUrl = new URL(url, 'https://rule34.xxx').href;
    
    chrome.downloads.download({
      url: finalUrl,
      filename: filename,
      conflictAction: 'uniquify',
      saveAs: false
    }, (id) => {
      if (chrome.runtime.lastError) {
        console.error("[R34Pro] Single Download Error:", chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    console.error("[R34Pro] Download URL Invalid:", url);
  }
}

async function startBulkQueue(tags: string, startId: string, count: number) {
  queueState.isDownloading = true;
  queueState.progress = 0;
  queueState.total = count;
  queueState.tags = tags;
  queueState.cancelRequested = false;

  await chrome.storage.local.set({ bulkQueueState: queueState });
  console.log(`[R34Pro] Background: Execution Trace | Tags: ${tags} | Start: ${startId} | Count: ${count}`);

  try {
    let collectedPosts: any[] = [];
    let pid = 0;
    
    // We use id:<= filter because API returns descending orders
    const baseTags = tags === 'all' ? '' : tags;
    const filterTags = `${baseTags} id:<=${startId}`.trim();

    while (collectedPosts.length < count && !queueState.cancelRequested) {
      const remaining = count - collectedPosts.length;
      const limit = Math.min(remaining, 100);
      
      const apiUrl = `${RULE34_ORIGIN}/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(filterTags)}&limit=${limit}&pid=${pid}`;
      console.log(`[R34Pro] Background: Collection Loop | PID: ${pid} | Seeking: ${limit} | Target: ${count}`);
      
      const res = await fetch(apiUrl, {
        headers: { 'Referer': 'https://rule34.xxx/' }
      });
      
      if (!res.ok) {
        console.error(`[R34Pro] Background: API Fetch Failed | Status: ${res.status}`);
        break;
      }
      
      const text = await res.text();
      let batch;
      try {
        batch = JSON.parse(text);
      } catch (parseError) {
        console.error("[R34Pro] Background: JSON Parse Error | Content:", text.substring(0, 200));
        break;
      }
      
      if (!Array.isArray(batch) || batch.length === 0) {
        console.log("[R34Pro] Background: Collection completed - No more posts in batch.");
        break;
      }
      
      collectedPosts = [...collectedPosts, ...batch];
      pid++;
      
      if (batch.length < limit) {
        console.log("[R34Pro] Background: Collection completed - Batch smaller than limit.");
        break; 
      }
      await new Promise(r => setTimeout(r, 300)); 
    }

    queueState.total = collectedPosts.length;
    await chrome.storage.local.set({ bulkQueueState: queueState });

    // 2. EXECUTION PHASE
    for (const post of collectedPosts) {
      if (queueState.cancelRequested) break;

      const ext = post.file_url.match(/\.(jpg|jpeg|png|gif|mp4|webm)/i)?.[0] || '.jpg';
      const sanitizedTags = tags.replace(/[^a-z0-9_]/gi, '_').substring(0, 50);
      const filename = `R34_Pro_${sanitizedTags || 'all'}_${post.id}${ext}`;
      
      let finalUrl = post.file_url;
      if (finalUrl.startsWith('//')) finalUrl = 'https:' + finalUrl;

      // We queue them but don't await the actual OS download completion
      // to keep the UI responsive, but we do pace the queueing.
      chrome.downloads.download({
        url: finalUrl,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false
      });

      queueState.progress++;
      await chrome.storage.local.set({ bulkQueueState: queueState });
      
      // Breather
      if (queueState.progress % 5 === 0) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[R34Pro] Bulk Download Complete: ${queueState.progress}/${queueState.total}`);

  } catch (e) {
    console.error("[R34Pro] Bulk Download Pipeline Failure:", e);
  } finally {
    queueState.isDownloading = false;
    await chrome.storage.local.set({ bulkQueueState: queueState });
  }
}
