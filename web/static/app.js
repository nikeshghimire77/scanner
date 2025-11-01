let allRows = [];
let keywords = [];
let fileKeywords = [];
let runtimeKeywords = [];
let seenTitles = new Set();
let hoverTimers = {}; // Track hover timers for each ticker
let lastRefreshTime = Date.now(); // Track last auto-refresh time
let appConfig = null; // Store config loaded from server

// Load configuration from server
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        appConfig = await response.json();
        console.log('Config loaded:', appConfig);
        
        // Show Elite badge if enabled
        if (appConfig.finviz_elite && appConfig.finviz_elite.enabled) {
            document.getElementById('elite-badge').style.display = 'inline-block';
            console.log('🚀 Finviz Elite mode ENABLED - Real-time data active!');
        } else {
            console.log('📊 Using free Finviz data (15-minute delay)');
        }
        
        return appConfig;
    } catch (error) {
        console.error('Error loading config:', error);
        // Return default config if loading fails
        return {
            refresh: {
                auto_refresh_interval_seconds: 60,
                hover_refresh_delay_seconds: 1,
                feed_poll_interval_seconds: 15,
                auto_refresh_check_interval_seconds: 10
            }
        };
    }
}

// Update header stats
function updateStats() {
    document.getElementById('total-count').textContent = allRows.length;
    
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    const matchCount = allRows.filter(row => {
        const text = (row.title + ' ' + row.tickers.join(' ')).toLowerCase();
        return lowerKeywords.some(k => text.includes(k));
    }).length;
    document.getElementById('match-count').textContent = matchCount;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-update').textContent = timeStr;
}

// Fetch data from the server
async function fetchData() {
    try {
        const response = await fetch('/api/feed');
        const data = await response.json();
        
        keywords = data.keywords;
        fileKeywords = data.file_keywords || [];
        runtimeKeywords = data.runtime_keywords || [];
        const newRows = data.rows;
        
        // Update keywords display
        updateKeywordsDisplay();
        
        // Check for new items
        const oldTitles = new Set(allRows.map(r => r.title));
        allRows = newRows;
        
        // Update stats
        updateStats();
        
        // Render
        renderAll();
        renderMatched(oldTitles);
        
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function updateKeywordsDisplay() {
    const keywordsList = document.getElementById('keywords-list');
    if (keywords.length > 0) {
        keywordsList.textContent = keywords.join(', ');
    } else {
        keywordsList.textContent = '(none)';
    }
    
    // Update the keyword tags
    updateKeywordTags();
}

function updateKeywordTags() {
    // Update file keywords display
    const fileKeywordsContainer = document.getElementById('file-keywords');
    if (fileKeywords.length > 0) {
        fileKeywordsContainer.innerHTML = fileKeywords.map(kw => 
            `<span class="keyword-tag file-keyword">${escapeHtml(kw)}</span>`
        ).join('');
    } else {
        fileKeywordsContainer.innerHTML = '<span class="no-keywords">(empty)</span>';
    }
    
    // Update runtime keywords display
    const runtimeKeywordsContainer = document.getElementById('runtime-keywords');
    if (runtimeKeywords.length > 0) {
        runtimeKeywordsContainer.innerHTML = runtimeKeywords.map(kw => 
            `<span class="keyword-tag runtime-keyword">
                ${escapeHtml(kw)}
                <button class="remove-keyword" onclick="removeKeyword('${escapeHtml(kw)}')">×</button>
            </span>`
        ).join('');
    } else {
        runtimeKeywordsContainer.innerHTML = '<span class="no-keywords">(none)</span>';
    }
}

function renderAll() {
    const container = document.getElementById('all-content');
    
    if (allRows.length === 0) {
        container.innerHTML = '<div class="loading"><span class="spinner"></span> Loading feed...</div>';
        return;
    }
    
    let html = '';
    allRows.forEach((row, index) => {
        const tickersHtml = row.tickers.length > 0 
            ? row.tickers.map(t => {
                const colorClass = getTickerColorClass(t);
                return `<span class="ticker ${colorClass} tooltip" data-tooltip="Loading stats...\nClick to view chart">${t}</span>`;
            }).join(' ')
            : '<span class="ticker">—</span>';
        
        const timestampHtml = row.timestamp ? `<span class="timestamp">${row.timestamp}</span>` : '';
        
        html += `
            <div class="news-item" onclick="openTickerInfo('${row.tickers[0] || ''}')">
                <span class="news-number">${(index + 1).toString().padStart(2, '0')}</span>
                <span class="tickers">${tickersHtml}</span>
                <span class="headline">${escapeHtml(row.title)}</span>
                ${timestampHtml}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Helper function to determine ticker color class
function getTickerColorClass(ticker) {
    if (ticker.includes('+')) return 'positive';
    if (ticker.includes('-')) return 'negative';
    return '';
}

// Helper function to clean ticker symbol
function cleanTickerSymbol(ticker) {
    return ticker.split('+')[0].split('-')[0].trim();
}

async function renderMatched(oldTitles = new Set()) {
    const container = document.getElementById('matched-content');
    
    if (keywords.length === 0) {
        container.innerHTML = '<div class="loading">No keywords.txt => passively watching feed…</div>';
        return;
    }
    
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    const hits = allRows.filter(row => {
        const text = (row.title + ' ' + row.tickers.join(' ')).toLowerCase();
        return lowerKeywords.some(k => text.includes(k));
    });
    
    if (hits.length === 0) {
        container.innerHTML = '<div class="loading">…no hits yet… (★ leave window open)</div>';
        return;
    }
    
    container.innerHTML = '';
    
    for (let i = 0; i < hits.length; i++) {
        const row = hits[i];
        const isNew = !oldTitles.has(row.title);
        
        // Create item element
        const itemDiv = document.createElement('div');
        itemDiv.className = `news-item news-item-matched ${isNew ? 'new-item' : ''}`;
        itemDiv.dataset.title = row.title;
        itemDiv.onclick = () => openTickerInfo(row.tickers[0] || '');
        
        const numberSpan = document.createElement('span');
        numberSpan.className = 'news-number';
        numberSpan.textContent = `[${(i + 1).toString().padStart(2, '0')}]`;
        
        const tickersSpan = document.createElement('span');
        tickersSpan.className = 'tickers';
        
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'arrow';
        arrowSpan.textContent = ' ⇒ ';
        
        const headlineSpan = document.createElement('span');
        headlineSpan.className = 'headline';
        headlineSpan.textContent = row.title;
        
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = row.timestamp || '';
        
        itemDiv.appendChild(numberSpan);
        itemDiv.appendChild(tickersSpan);
        itemDiv.appendChild(arrowSpan);
        itemDiv.appendChild(headlineSpan);
        if (row.timestamp) {
            itemDiv.appendChild(timestampSpan);
        }
        
        container.appendChild(itemDiv);
        
        // Display tickers with loading indicator
        if (row.tickers.length > 0) {
            let tickerElements = row.tickers.map(t => {
                const colorClass = getTickerColorClass(t);
                const metrics = row.volumes[t];
                
                if (metrics && typeof metrics === 'object') {
                    // Build tooltip with change color
                    let changeDisplay = metrics.change || 'N/A';
                    let changeColor = '';
                    if (changeDisplay !== 'N/A' && changeDisplay.includes('%')) {
                        changeColor = changeDisplay.startsWith('-') ? '🔴' : '🟢';
                    }
                    
                    const tooltipText = `${changeColor} Change: ${changeDisplay}\nRel Volume: ${metrics.rel_volume}\nVolume: ${metrics.volume}\nShs Float: ${metrics.shs_float}\n\nClick to see chart`;
                    return `<span class="ticker ${colorClass} tooltip hover-refresh" data-ticker="${t}" data-tooltip="${tooltipText}">${t}</span>`;
                } else {
                    return `<span class="ticker ${colorClass} tooltip hover-refresh" data-ticker="${t}" data-tooltip="Loading stats...\nClick to view chart">${t}</span>`;
                }
            }).join(' ');
            tickersSpan.innerHTML = tickerElements;
            
            // Attach hover listeners for real-time refresh
            attachHoverListeners(tickersSpan, row);
            
            // Fetch missing volumes progressively
            for (const ticker of row.tickers) {
                if (!row.volumes[ticker]) {
                    await fetchVolume(ticker, row, tickersSpan);
                }
            }
        } else {
            tickersSpan.innerHTML = '<span class="ticker">—</span>';
        }
        
        // Remove new item highlight after animation
        if (isNew) {
            setTimeout(() => {
                itemDiv.classList.remove('new-item');
            }, 3000);
        }
    }
}

async function fetchVolume(ticker, row, tickersSpan, forceRefresh = false) {
    try {
        const cleanTicker = cleanTickerSymbol(ticker);
        const url = forceRefresh 
            ? `/api/volume/${encodeURIComponent(cleanTicker)}?refresh=true`
            : `/api/volume/${encodeURIComponent(cleanTicker)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.metrics) {
            // Update the row data
            row.volumes[ticker] = data.metrics;
            
            // Update the display
            let tickerElements = row.tickers.map(t => {
                const colorClass = getTickerColorClass(t);
                const metrics = row.volumes[t];
                
                if (metrics && typeof metrics === 'object') {
                    // Build tooltip with change color
                    let changeDisplay = metrics.change || 'N/A';
                    let changeColor = '';
                    if (changeDisplay !== 'N/A' && changeDisplay.includes('%')) {
                        changeColor = changeDisplay.startsWith('-') ? '🔴' : '🟢';
                    }
                    
                    const tooltipText = `${changeColor} Change: ${changeDisplay}\nRel Volume: ${metrics.rel_volume}\nVolume: ${metrics.volume}\nShs Float: ${metrics.shs_float}\n\nClick to see chart`;
                    return `<span class="ticker ${colorClass} tooltip hover-refresh" data-ticker="${t}" data-tooltip="${tooltipText}">${t}</span>`;
                } else {
                    return `<span class="ticker ${colorClass} tooltip hover-refresh" data-ticker="${t}" data-tooltip="Loading stats...\nClick to view chart">${t}</span>`;
                }
            }).join(' ');
            tickersSpan.innerHTML = tickerElements;
            
            // Re-attach hover listeners after updating HTML
            attachHoverListeners(tickersSpan, row);
        }
    } catch (error) {
        console.error(`Error fetching volume for ${ticker}:`, error);
        row.volumes[ticker] = { volume: 'N/A', rel_volume: 'N/A', shs_float: 'N/A', change: 'N/A' };
    }
}

function openTickerInfo(ticker) {
    if (!ticker || ticker === '—') return;
    // Remove any percentage modifiers
    const cleanTicker = ticker.split('+')[0].split('-')[0].trim();
    // Open finviz chart
    window.open(`https://finviz.com/quote.ashx?t=${cleanTicker}`, '_blank');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Attach hover listeners to ticker elements for real-time refresh
function attachHoverListeners(tickersSpan, row) {
    const tickerElements = tickersSpan.querySelectorAll('.hover-refresh');
    tickerElements.forEach(tickerEl => {
        const ticker = tickerEl.dataset.ticker;
        
        tickerEl.addEventListener('mouseenter', () => {
            // Clear any existing timer for this ticker
            if (hoverTimers[ticker]) {
                clearTimeout(hoverTimers[ticker]);
            }
            
            // Get hover delay from config (in milliseconds)
            const hoverDelay = appConfig 
                ? appConfig.refresh.hover_refresh_delay_seconds * 1000 
                : 1000;
            
            // Set a timer to refresh on hover
            hoverTimers[ticker] = setTimeout(async () => {
                console.log(`Hover refresh for ${ticker}`);
                await fetchVolume(ticker, row, tickersSpan, true); // Force refresh
            }, hoverDelay);
        });
        
        tickerEl.addEventListener('mouseleave', () => {
            // Cancel the timer if user moves mouse away before delay expires
            if (hoverTimers[ticker]) {
                clearTimeout(hoverTimers[ticker]);
                delete hoverTimers[ticker];
            }
        });
    });
}

// Auto-refresh all matched tickers every minute
async function autoRefreshMatchedTickers() {
    if (!appConfig) return; // Wait for config to load
    
    const now = Date.now();
    const refreshInterval = appConfig.refresh.auto_refresh_interval_seconds * 1000;
    
    // Check if the interval has passed since last refresh
    if (now - lastRefreshTime < refreshInterval) {
        return;
    }
    
    lastRefreshTime = now;
    
    // Get all unique tickers from matched signals
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    const matchedRows = allRows.filter(row => {
        const text = (row.title + ' ' + row.tickers.join(' ')).toLowerCase();
        return lowerKeywords.some(k => text.includes(k));
    });
    
    const uniqueTickers = new Set();
    matchedRows.forEach(row => {
        row.tickers.forEach(ticker => {
            const cleanTicker = cleanTickerSymbol(ticker);
            uniqueTickers.add(cleanTicker);
        });
    });
    
    if (uniqueTickers.size > 0) {
        console.log(`Auto-refreshing ${uniqueTickers.size} matched tickers...`);
        
        try {
            const response = await fetch('/api/volume/refresh-matched', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tickers: Array.from(uniqueTickers) })
            });
            
            const data = await response.json();
            if (data.success) {
                console.log(`Refreshed ${data.refreshed.length} tickers`);
                // Re-render matched section to show updated data
                await fetchData();
            }
        } catch (error) {
            console.error('Error auto-refreshing tickers:', error);
        }
    }
}

// Keyword Management Functions
async function addKeyword() {
    const input = document.getElementById('keyword-input');
    const keyword = input.value.trim();
    
    if (!keyword) {
        alert('Please enter a keyword');
        return;
    }
    
    try {
        const response = await fetch('/api/keywords/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keyword: keyword })
        });
        
        const data = await response.json();
        
        if (data.success) {
            input.value = '';
            await fetchData(); // Refresh to get updated keywords
        } else {
            alert(data.error || 'Failed to add keyword');
        }
    } catch (error) {
        console.error('Error adding keyword:', error);
        alert('Error adding keyword');
    }
}

async function removeKeyword(keyword) {
    try {
        const response = await fetch('/api/keywords/remove', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keyword: keyword })
        });
        
        const data = await response.json();
        
        if (data.success) {
            await fetchData(); // Refresh to get updated keywords
        } else {
            alert(data.error || 'Failed to remove keyword');
        }
    } catch (error) {
        console.error('Error removing keyword:', error);
        alert('Error removing keyword');
    }
}

async function clearAllKeywords() {
    if (!confirm('Clear all UI keywords? (keywords.txt will not be affected)')) {
        return;
    }
    
    try {
        const response = await fetch('/api/keywords/clear', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            await fetchData(); // Refresh to get updated keywords
        } else {
            alert('Failed to clear keywords');
        }
    } catch (error) {
        console.error('Error clearing keywords:', error);
        alert('Error clearing keywords');
    }
}

async function reloadFromFile() {
    try {
        const response = await fetch('/api/keywords/reload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            await fetchData(); // Refresh to get updated keywords
            alert(`Reloaded ${data.file_keywords.length} keywords from file`);
        } else {
            alert('Failed to reload keywords');
        }
    } catch (error) {
        console.error('Error reloading keywords:', error);
        alert('Error reloading keywords');
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Add keyword button
    document.getElementById('add-keyword-btn').addEventListener('click', addKeyword);
    
    // Enter key in input field
    document.getElementById('keyword-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addKeyword();
        }
    });
    
    // Clear all button
    document.getElementById('clear-all-btn').addEventListener('click', clearAllKeywords);
    
    // Reload file button
    document.getElementById('reload-file-btn').addEventListener('click', reloadFromFile);
});

// Initialize app
async function initApp() {
    // Load config first
    await loadConfig();
    
    // Initial data fetch
    await fetchData();
    
    // Set up polling intervals using config
    const feedPollInterval = appConfig 
        ? appConfig.refresh.feed_poll_interval_seconds * 1000 
        : 15000;
    const autoRefreshCheckInterval = appConfig 
        ? appConfig.refresh.auto_refresh_check_interval_seconds * 1000 
        : 10000;
    
    console.log(`Feed poll interval: ${feedPollInterval / 1000}s`);
    console.log(`Auto-refresh check interval: ${autoRefreshCheckInterval / 1000}s`);
    console.log(`Auto-refresh interval: ${appConfig.refresh.auto_refresh_interval_seconds}s`);
    console.log(`Hover refresh delay: ${appConfig.refresh.hover_refresh_delay_seconds}s`);
    
    // Poll for updates
    setInterval(fetchData, feedPollInterval);
    
    // Check for auto-refresh
    setInterval(autoRefreshMatchedTickers, autoRefreshCheckInterval);
}

// Start the app
initApp();
