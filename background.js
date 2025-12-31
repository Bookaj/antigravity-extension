import { SimpleZip } from './zip_utils.js';

console.log("Antigravity v2 Background Loaded (Parallel Edition)");

// === CONFIGURATION ===
const CONFIG = {
    MAX_CONCURRENCY: 3, // Opening 3 tabs at once is a sweet spot for speed vs stability
    SCRAPE_BUFFER_MS: 3000,
    TAB_TIMEOUT_MS: 120000
};

// === STATE ===
const State = {
    queue: [],
    results: [],
    isProcessing: false,
    activeTabs: new Set(),
    pendingTabs: 0,
    format: 'markdown',
    maxConcurrency: 3, // Default fallback
    timeouts: new Map() // tabId -> timeoutId
};

// === MESSAGE HANDLER ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_BATCH") {
        console.log(`Starting Batch: ${request.queue.length} items (${request.format}, Concurrency: ${request.concurrency})`);
        State.queue = [...request.queue];
        State.format = request.format;
        State.maxConcurrency = request.concurrency || 3;
        State.results = [];
        State.isProcessing = true;
        State.activeTabs.clear();
        State.pendingTabs = 0;
        State.timeouts.forEach(t => clearTimeout(t));
        State.timeouts.clear();

        fillPool();
        sendResponse({ status: "started" });
    }

    if (request.action === "STOP_BATCH") {
        stopProcessing();
        sendResponse({ status: "stopped" });
    }

    return true;
});

function stopProcessing() {
    State.isProcessing = false;
    State.queue = [];
    State.activeTabs.forEach(tabId => {
        chrome.tabs.remove(tabId, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
        });
    });
    State.activeTabs.clear();
    State.timeouts.forEach(t => clearTimeout(t));
    State.timeouts.clear();
}

// === PROCESSING POOL ===
function fillPool() {
    if (!State.isProcessing) return;

    // Check if we are totally done
    if (State.queue.length === 0 && State.activeTabs.size === 0 && State.pendingTabs === 0) {
        finishBatch();
        return;
    }

    // Launch survivors if pool has space and queue has items
    // Sync check: count both active and about-to-be-active tabs
    while ((State.activeTabs.size + State.pendingTabs) < State.maxConcurrency && State.queue.length > 0) {
        const item = State.queue.shift();
        State.pendingTabs++; // Increment synchronously!
        launchTab(item);
    }
}

function launchTab(item) {
    chrome.tabs.create({ url: item.url, active: false }, (tab) => {
        State.pendingTabs--; // Decrement once we have the ID

        if (!State.isProcessing) {
            // If processing was stopped while tab was opening
            chrome.tabs.remove(tab.id);
            return;
        }

        const tabId = tab.id;
        State.activeTabs.add(tabId);
        console.log(`[Pool] Launched tab ${tabId} for ${item.url}`);

        // Set Safety Timeout
        const tId = setTimeout(() => {
            console.warn(`[Pool] Timeout on tab ${tabId} (${item.url}). Skipping.`);
            cleanupTab(tabId);
        }, CONFIG.TAB_TIMEOUT_MS);
        State.timeouts.set(tabId, tId);

        // Listen for completion
        const listener = (id, info) => {
            if (id === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);

                // Buffer to allow content scripts to settle
                setTimeout(() => {
                    requestScrape(tabId, item);
                }, CONFIG.SCRAPE_BUFFER_MS);
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

function requestScrape(tabId, item) {
    if (!State.activeTabs.has(tabId)) return;

    chrome.tabs.sendMessage(tabId, {
        action: "EXECUTE_SCROLL_AND_SCRAPE",
        format: State.format
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error(`[Pool] Msg Error on ${tabId}:`, chrome.runtime.lastError.message);
        } else if (response && response.data) {
            if (!response.data.error) {
                State.results.push(response.data);
                console.log(`[Pool] Successfully scraped ${response.data.title}`);
            } else {
                console.error(`[Pool] Scrape Error on ${tabId}:`, response.data.error);
            }
        }
        cleanupTab(tabId);
    });
}

function cleanupTab(tabId) {
    // Clear timeout
    if (State.timeouts.has(tabId)) {
        clearTimeout(State.timeouts.get(tabId));
        State.timeouts.delete(tabId);
    }

    // Remove tab
    if (State.activeTabs.has(tabId)) {
        State.activeTabs.delete(tabId);
        chrome.tabs.get(tabId, () => {
            if (!chrome.runtime.lastError) {
                chrome.tabs.remove(tabId, () => {
                    fillPool(); // Try to fill the vacancy
                });
            } else {
                fillPool();
            }
        });
    }
}

// === FINISHING ===
async function finishBatch() {
    State.isProcessing = false;
    console.log(`Batch Complete. Bundling ${State.results.length} files.`);

    if (State.results.length === 0) {
        console.warn("No results to download.");
        return;
    }

    const zip = new SimpleZip();
    State.results.forEach(res => {
        let safeTitle = res.title.replace(/[<>:"/\\|?*]/g, '_').trim().substring(0, 100);
        if (!safeTitle) safeTitle = `Untitled_${Date.now()}`;
        const ext = State.format === 'html' ? 'html' : 'md';
        zip.addFile(`${safeTitle}.${ext}`, res.content);
    });

    const blob = zip.generate();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `Antigravity_Export_${timestamp}.zip`;

    const reader = new FileReader();
    reader.onload = function () {
        chrome.downloads.download({
            url: reader.result,
            filename: `Antigravity_Brain/${filename}`,
            saveAs: false
        });
    };
    reader.readAsDataURL(blob);
}
