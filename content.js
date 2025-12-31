// ANTIGRAVITY v2 - CONTENT SCRIPT (KISS EDITION)
// Philosophy: "Simple is better." - Scroll, Wait, Scrape.

// === CONFIGURATION ===
const AG_CONFIG = {
    selectors: {
        gemini: {
            idRegex: /c_([a-z0-9]{10,})/,
            title: 'h1[data-test-id="conversation-title"], .conversation-title, h1',
            // Broad selectors for maximum compatibility
            messages: '.markdown, .query-text, .user-query, .model-response, [data-test-id="model-response"]',
            // The container that actually scrolls
            scrollContainer: 'infinite-scroller'
        }
    },
    timeouts: {
        hydration: 20000,
        scroll: 40 // Turbo tick
    }
};

// === UTILITIES ===
const Utils = {
    wait: (ms) => new Promise(r => setTimeout(r, ms)),

    waitForContent: async (selector, timeout = 5000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el && el.innerText.trim().length > 0) return el;
            await Utils.wait(500);
        }
        return null;
    },

    log: (msg, type = 'info') => {
        console.log(`[AG - v2][${type.toUpperCase()}] ${msg} `);
    }
};

// === CRAWLER (ID DISCOVERY) ===
const Crawler = {
    getPlatform: () => {
        if (window.location.hostname.includes('gemini')) return 'gemini';
        return 'unknown';
    },

    scan: async () => {
        Utils.log("Scanning sidebar...");
        const candidates = [];
        const seen = new Set();

        // 1. Locate Sidebar
        const nav = document.querySelector('nav') || document.querySelector('[role="navigation"]');
        const container = nav || document.body;

        // 2. Scan for specific Gemini identifiers
        const conversationRows = container.querySelectorAll('div[data-test-id="conversation"], [role="button"][jslog*="c_"]');

        conversationRows.forEach(row => {
            const jslog = row.getAttribute('jslog');
            const match = jslog ? jslog.match(AG_CONFIG.selectors.gemini.idRegex) : null;

            if (match && match[1]) {
                const id = match[1];
                const url = `https://gemini.google.com/app/${id}`;

                if (!seen.has(url)) {
                    let title = "";
                    const titleEl = row.querySelector('.conversation-title');
                    if (titleEl) title = titleEl.innerText.trim();
                    if (!title) title = row.innerText.split('\n')[0].trim();
                    if (!title || title.length < 2) title = `Chat ${id.slice(-4)}`;

                    seen.add(url);
                    candidates.push({ title, url, id });
                }
            }
        });

        // 3. Fallback: Scan Links
        const links = container.querySelectorAll('a[href*="/app/"]');
        links.forEach(a => {
            const href = a.getAttribute('href');
            if (href.match(/\/app\/[a-z0-9]+/)) {
                // Ignore if it's just a link to the current page (hash)
                const urlObj = new URL(href, window.location.origin);
                const id = urlObj.pathname.split('/app/')[1];

                if (id && id.length > 5 && !seen.has(urlObj.href)) {
                    seen.add(urlObj.href);
                    let title = a.innerText.trim();
                    if (!title) title = `Chat ${id.slice(-4)}`;
                    candidates.push({ title, url: urlObj.href, id });
                }
            }
        });

        const valid = candidates.filter(c => !c.id.includes('click') && !c.id.includes('mode'));
        Utils.log(`Found ${valid.length} chats.`);
        return valid;
    }
};

// === SCRAPER (CONTENT EXTRACTION) ===
const Scraper = {
    forceHydration: () => {
        try {
            // Fake visibility
            Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        } catch (e) { }
    },

    extract: async (format = 'markdown') => {
        Scraper.forceHydration();
        const platform = Crawler.getPlatform();

        // 1. IDENTIFY SCROLLABLE AREA
        let scrollable = null;
        const scrollers = document.querySelectorAll(AG_CONFIG.selectors.gemini.scrollContainer);

        // Find the scroller that actually has messages
        for (const s of scrollers) {
            if (s.querySelector('.markdown') || s.querySelector('.query-text')) {
                scrollable = s;
                break;
            }
        }
        if (!scrollable) scrollable = document.querySelector('main') || document.body;

        Utils.log(`Targeting: ${scrollable.tagName}`);

        // 2. TURBO SCROLL (Fast & Simple)
        if (scrollable) {
            scrollable.scrollTo(0, 0);
            await Utils.wait(200);

            let lastHeight = scrollable.scrollHeight;
            let stableCount = 0;
            const step = window.innerHeight; // Big steps
            let current = 0;

            while (true) {
                current += step;
                if (current > scrollable.scrollHeight) current = scrollable.scrollHeight;
                scrollable.scrollTo(0, current);
                await Utils.wait(AG_CONFIG.timeouts.scroll);

                if (current >= scrollable.scrollHeight) {
                    if (scrollable.scrollHeight > lastHeight) {
                        lastHeight = scrollable.scrollHeight;
                        stableCount = 0;
                    } else {
                        stableCount++;
                        if (stableCount > 10) break; // ~400ms stable
                    }
                }
            }
            // Final settle
            await Utils.wait(1000);
        }

        // 3. EXTRACT
        let realTitle = document.title;
        const headerEl = document.querySelector(AG_CONFIG.selectors.gemini.title);
        if (headerEl) realTitle = headerEl.innerText.trim();
        if (!realTitle || realTitle === "Gemini") realTitle = `Gemini_Chat_${Date.now()}`;

        let content = "";

        if (format === 'html') {
            const clone = (scrollable || document.body).cloneNode(true);
            clone.querySelectorAll('nav, side-navigation-v2, script, style').forEach(e => e.remove());
            content = `<!-- Title: ${realTitle} -->\n` + clone.innerHTML;
        } else {
            const messages = document.querySelectorAll(AG_CONFIG.selectors.gemini.messages);
            if (messages.length === 0) content = "No messages found.";
            else {
                messages.forEach(msg => {
                    let role = "GEMINI";
                    if (msg.classList.contains('query-text') || msg.classList.contains('user-query')) role = "USER";
                    content += `\n\n### ${role}\n${msg.innerText.trim()}`;
                });
            }
        }

        return {
            title: realTitle,
            content: content,
            url: window.location.href,
            platform: platform,
            format: format
        };
    }
};

// === MESSAGING ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SCAN_SIDEBAR") {
        Crawler.scan().then(chats => sendResponse({ chats }));
        return true;
    }
    if (request.action === "EXECUTE_SCROLL_AND_SCRAPE") {
        Scraper.extract(request.format).then(data => sendResponse({ data }));
        return true;
    }
});

// === UI INJECTION ===
if (window.location.href.startsWith("https://gemini.google.com")) {
    const btn = document.createElement('button');
    btn.innerText = "📦 Archive Chats (v2)";
    btn.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:9999; padding:10px 20px; background:#8b5cf6; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.2);";

    btn.onclick = async () => {
        const chats = await Crawler.scan();
        UI.showModal(chats);
    };

    // Inject button when idle
    setTimeout(() => document.body.appendChild(btn), 2000);
}

// === UI HELPER ===
const UI = {
    showModal: (chats) => {
        const d = document.createElement('div');
        d.id = 'ag-modal-v2';
        d.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10000; display:flex; justify-content:center; align-items:center; font-family: sans-serif;";

        const listHtml = chats.map((c, i) => `
            <div style="padding:6px; font-size:13px; border-bottom:1px solid #333; display:flex; align-items:center;">
                <input type="checkbox" class="ag-chat-checkbox" id="ag-chat-${i}" checked style="margin-right:10px;" data-index="${i}">
                <label for="ag-chat-${i}" style="color:#ddd; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.title}</label>
            </div>
        `).join('');

        d.innerHTML = `
            <div style="background:#222; color:#fff; padding:20px; border-radius:10px; width:500px; max-height:80vh; display:flex; flex-direction:column;">
                <h3>Found ${chats.length} Chats</h3>
                
                <div style="margin-bottom: 10px; display:flex; align-items:center; gap:10px;">
                    <label style="font-size: 13px; color: #aaa;">Parallel Tabs:</label>
                    <input type="number" id="ag-concurrency" value="3" min="1" max="10" style="background:#333; color:white; border:1px solid #555; border-radius:4px; padding:4px; width:50px;">
                    
                    <label style="font-size: 13px; color: #aaa; margin-left: 20px;">Use Proxy (SOCKS5):</label>
                    <input type="checkbox" id="ag-use-proxy" checked style="cursor:pointer;">
                </div>

                <div style="display:flex; gap:10px; margin-bottom:10px;">
                    <button id="ag-toggle-all" style="background:none; border:none; color:#60a5fa; cursor:pointer;">Deselect All</button>
                </div>
                <div style="flex:1; overflow-y:auto; border:1px solid #444; padding:5px; margin-bottom:10px;">
                    ${listHtml}
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button id="ag-cancel" style="background:transparent; border:1px solid #555; color:#ccc; padding:8px 16px; border-radius:4px; cursor:pointer;">Cancel</button>
                    <button id="ag-run" style="background:#2563eb; color:white; border:none; padding:8px 20px; border-radius:4px; cursor:pointer;">Archive ${chats.length} Chats</button>
                </div>
            </div>
        `;
        document.body.appendChild(d);

        // Checkbox Logic
        const updateBtn = () => {
            const count = d.querySelectorAll('.ag-chat-checkbox:checked').length;
            d.querySelector('#ag-run').innerText = `Archive ${count} Chats`;
        };
        d.querySelectorAll('.ag-chat-checkbox').forEach(cb => cb.onchange = updateBtn);

        d.querySelector('#ag-toggle-all').onclick = () => {
            const all = d.querySelectorAll('.ag-chat-checkbox');
            const isAll = Array.from(all).every(c => c.checked);
            all.forEach(c => c.checked = !isAll);
            d.querySelector('#ag-toggle-all').innerText = isAll ? "Select All" : "Deselect All";
            updateBtn();
        };

        d.querySelector('#ag-cancel').onclick = () => d.remove();
        d.querySelector('#ag-run').onclick = () => {
            const selectedIndices = Array.from(d.querySelectorAll('.ag-chat-checkbox:checked')).map(cb => parseInt(cb.dataset.index));
            const selectedChats = selectedIndices.map(i => chats[i]);
            const concurrency = parseInt(document.getElementById('ag-concurrency').value) || 3;
            const useProxy = document.getElementById('ag-use-proxy').checked;

            d.remove();
            if (selectedChats.length > 0) {
                chrome.runtime.sendMessage({
                    action: "START_BATCH",
                    queue: selectedChats,
                    format: 'markdown',
                    concurrency: concurrency,
                    useProxy: useProxy
                });
            }
        };
    }
};
