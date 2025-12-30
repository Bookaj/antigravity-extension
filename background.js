import { SimpleZip } from './zip_utils.js';

console.log("Antigravity v2 Background Loaded");

// === STATE ===
const State = {
    queue: [],
    results: [],
    isProcessing: false,
    tabId: null,
    format: 'markdown',
    timeoutTimer: null
};

// === MESSAGE HANDLER ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // 1. START BATCH
    if (request.action === "START_BATCH") {
        console.log(`Starting Batch: ${request.queue.length} items (${request.format})`);
        State.queue = request.queue;
        State.format = request.format;
        State.results = [];
        State.isProcessing = true;

        processNextItem();
        sendResponse({ status: "started" });
    }

    // 2. STOP BATCH
    if (request.action === "STOP_BATCH") {
        State.isProcessing = false;
        State.queue = [];
        if (State.tabId) chrome.tabs.remove(State.tabId);
        sendResponse({ status: "stopped" });
    }

    return true;
});

// === PROCESSING LOOP ===
function processNextItem() {
    // Clear any previous timeout
    if (State.timeoutTimer) clearTimeout(State.timeoutTimer);

    if (!State.isProcessing || State.queue.length === 0) {
        finishBatch();
        return;
    }

    const item = State.queue.shift();
    console.log(`Processing: ${item.url}`);

    // Create Background Tab (Inactive)
    chrome.tabs.create({ url: item.url, active: false }, (tab) => {
        State.tabId = tab.id;

        // SAFETY TIMEOUT: If tab hangs (e.g. infinite load), kill it after 120s
        State.timeoutTimer = setTimeout(() => {
            console.warn(`Timeout on ${item.url}. Skipping.`);
            closeAndNext(State.tabId);
        }, 120000);

        // Wait for load, then scrape
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === State.tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);

                // Inject Scrape Command
                // Give it a tiny buffer for content script to register listener
                setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, {
                        action: "EXECUTE_SCROLL_AND_SCRAPE",
                        format: State.format
                    }, (response) => {

                        // Handle Response
                        if (chrome.runtime.lastError) {
                            console.error("Msg Error:", chrome.runtime.lastError);
                            // It might be that content script didn't load in time.
                        } else if (response && response.data) {
                            // Valid Data
                            if (!response.data.error) {
                                State.results.push(response.data);
                            } else {
                                console.error("Scrape Error:", response.data.error);
                            }
                        }

                        closeAndNext(tabId);
                    });
                }, 2500); // 2.5s buffer after load complete
            }
        });
    });
}

function closeAndNext(tabId) {
    if (State.timeoutTimer) clearTimeout(State.timeoutTimer);

    // Check if tab still exists before removing
    chrome.tabs.get(tabId, () => {
        if (!chrome.runtime.lastError) {
            chrome.tabs.remove(tabId, () => {
                State.tabId = null;
                processNextItem(); // Recursive step
            });
        } else {
            State.tabId = null;
            processNextItem();
        }
    });
}

// === FINISHING ===
async function finishBatch() {
    State.isProcessing = false;
    console.log(`Batch Complete. Bundling ${State.results.length} files.`);

    if (State.results.length === 0) {
        console.warn("No results to download.");
        return;
    }

    // Generate ZIP
    const zip = new SimpleZip();

    State.results.forEach(res => {
        // Sanitize Filename
        // Allow unicode but remove dangerous chars
        let safeTitle = res.title.replace(/[<>:"/\\|?*]/g, '_').trim().substring(0, 100);
        if (!safeTitle) safeTitle = `Untitled_${Date.now()}`;

        const ext = State.format === 'html' ? 'html' : 'md';
        zip.addFile(`${safeTitle}.${ext}`, res.content);
    });

    const blob = zip.generate();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `Antigravity_Export_${timestamp}.zip`;

    // Download
    const reader = new FileReader();
    reader.onload = function () {
        chrome.downloads.download({
            url: reader.result,
            filename: `Antigravity_Brain/${filename}`,
            saveAs: false // Silent download
        });
    };
    reader.readAsDataURL(blob);
}
