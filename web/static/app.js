let allRows = [];
let keywords = [];
let seenTitles = new Set();
let readTitles = new Map(); // Track which news items user has seen/read: {title: timestamp}
let isFirstLoad = true; // Track if this is the first data fetch
let alertQueue = []; // Queue for multiple popup alerts
let isShowingAlert = false; // Track if alert is currently visible

const READ_EXPIRY_HOURS = 4; // Read status expires after 4 hours (fresh for trading sessions)

// Get start of current day in milliseconds
function getStartOfDay() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
}

// Load read titles from localStorage with expiration check
function loadReadTitles() {
    try {
        const saved = localStorage.getItem('readTitles');
        const now = Date.now();
        const startOfDay = getStartOfDay();

        if (saved) {
            const data = JSON.parse(saved);

            // Handle old format (just array of titles) - ignore it, start fresh
            if (Array.isArray(data)) {
                return;
            }

            // Check if we need to clear for new day
            const lastCleared = data.lastCleared || 0;
            if (lastCleared < startOfDay) {
                // New day started, clear everything
                readTitles.clear();
                saveReadTitles();
                return;
            }

            // New format: {titles: {title: timestamp}, lastCleared: timestamp}
            if (data.titles && typeof data.titles === 'object') {
                const expiryMs = READ_EXPIRY_HOURS * 60 * 60 * 1000;
                // Only keep items that haven't expired
                Object.entries(data.titles).forEach(([title, timestamp]) => {
                    if (now - timestamp < expiryMs) {
                        readTitles.set(title, timestamp);
                    }
                });
            }
        }
    } catch (e) {
        console.error('Error loading read titles:', e);
    }
}

// Save read titles to localStorage
function saveReadTitles() {
    try {
        const data = {
            titles: Object.fromEntries(readTitles),
            lastCleared: Date.now()
        };
        localStorage.setItem('readTitles', JSON.stringify(data));
    } catch (e) {
        console.error('Error saving read titles:', e);
    }
}

// Check if a title is read (and not expired)
function isRead(title) {
    if (!readTitles.has(title)) return false;
    const timestamp = readTitles.get(title);
    const now = Date.now();
    const expiryMs = READ_EXPIRY_HOURS * 60 * 60 * 1000;
    return (now - timestamp) < expiryMs;
}

// Mark a title as read
function markAsRead(title) {
    readTitles.set(title, Date.now());
    saveReadTitles();
}

// Clear all read titles (manual reset)
function clearReadTitles() {
    readTitles.clear();
    saveReadTitles();
    // Re-render to show all items as unread
    const newTitles = new Set(allRows.map(row => row.title));
    renderMatched(newTitles);
    updateUnreadCounter();
}

// Load on page load
loadReadTitles();

// Show urgent alert popup (with queue support for multiple news)
function showUrgentAlert(title, tickers, queuePosition = null, totalInQueue = null) {
    const alert = document.getElementById('urgent-alert');
    const tickersEl = document.getElementById('urgent-tickers');
    const titleEl = document.getElementById('urgent-title');

    if (!alert) return;

    // If already showing an alert, queue this one instead
    if (isShowingAlert) {
        alertQueue.push({
            title: title,
            tickers: tickers,
            position: queuePosition,
            total: totalInQueue
        });
        return;
    }

    const tickerStr = tickers && tickers.length > 0 ? tickers.join(', ') : 'News';

    // Show queue position if multiple items
    let displayTitle = title;
    if (queuePosition !== null && totalInQueue !== null && totalInQueue > 1) {
        displayTitle = `[${queuePosition}/${totalInQueue}] ${title}`;
    }

    tickersEl.textContent = tickerStr;
    titleEl.textContent = displayTitle;

    alert.classList.remove('hidden');
    isShowingAlert = true;

    // Play URGENT ALARM - intense emergency alert
    try {
        let audioContext = window.audioContext;
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            window.audioContext = audioContext;
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const now = audioContext.currentTime;
        const totalDuration = 1.2; // Longer alarm

        // Create multiple oscillators for intense alarm (like fire alarm)
        // Low frequency rumble
        const lowOsc = audioContext.createOscillator();
        const lowGain = audioContext.createGain();
        lowOsc.connect(lowGain);
        lowGain.connect(audioContext.destination);
        lowOsc.frequency.value = 220; // Low rumble
        lowOsc.type = 'square'; // Harsh square wave
        lowGain.gain.setValueAtTime(0, now);
        lowGain.gain.linearRampToValueAtTime(0.8, now + 0.02);
        lowGain.gain.setValueAtTime(0.8, now + totalDuration * 0.9);
        lowGain.gain.linearRampToValueAtTime(0, now + totalDuration);
        lowOsc.start(now);
        lowOsc.stop(now + totalDuration);

        // High frequency alarm (very fast pulses)
        for (let i = 0; i < 8; i++) {
            const pulseTime = now + (i * 0.15);
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();

            osc.connect(gain);
            gain.connect(audioContext.destination);

            // Very high, sharp frequency
            osc.frequency.value = 2000 + (i % 2) * 400; // Alternating high pitches
            osc.type = 'square'; // Harsh and piercing

            // Aggressive attack
            gain.gain.setValueAtTime(0, pulseTime);
            gain.gain.linearRampToValueAtTime(1.0, pulseTime + 0.01); // Max volume
            gain.gain.setValueAtTime(1.0, pulseTime + 0.08);
            gain.gain.linearRampToValueAtTime(0, pulseTime + 0.12);

            osc.start(pulseTime);
            osc.stop(pulseTime + 0.12);
        }

        // Continuous high-pitched wail
        const wailOsc = audioContext.createOscillator();
        const wailGain = audioContext.createGain();
        wailOsc.connect(wailGain);
        wailGain.connect(audioContext.destination);

        // Fast sweeping siren
        wailOsc.frequency.setValueAtTime(1600, now);
        wailOsc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        wailOsc.frequency.exponentialRampToValueAtTime(1600, now + 0.2);
        wailOsc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
        wailOsc.frequency.exponentialRampToValueAtTime(1600, now + 0.4);
        wailOsc.frequency.exponentialRampToValueAtTime(800, now + 0.5);
        wailOsc.frequency.exponentialRampToValueAtTime(1600, now + 0.6);

        wailOsc.type = 'sawtooth';
        wailGain.gain.setValueAtTime(0.9, now);
        wailGain.gain.setValueAtTime(0.9, now + totalDuration * 0.8);
        wailGain.gain.linearRampToValueAtTime(0, now + totalDuration);

        wailOsc.start(now);
        wailOsc.stop(now + totalDuration);

    } catch (e) {
        console.error('Sound error:', e);
    }

    // Browser notification
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`🚨 URGENT: ${tickerStr}`, { body: title });
    }

    // Read headline out loud using text-to-speech (natural voice)
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        // Wait a moment for alarm to play first
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance();

            // Natural, human-like voice settings
            utterance.text = `${tickerStr}. ${title}`;
            utterance.rate = 1.1; // Slightly faster for natural flow
            utterance.pitch = 1.1; // Slightly higher pitch (more human-like)
            utterance.volume = 1.0; // Max volume

            // Try to use most natural-sounding voice
            const voices = window.speechSynthesis.getVoices();

            // Prefer natural voices in order: premium > Google > enhanced > female > male
            let selectedVoice = null;

            // First choice: Premium/natural voices
            selectedVoice = voices.find(v =>
                v.name.includes('Premium') ||
                v.name.includes('Natural') ||
                v.name.includes('WaveNet') ||
                v.name.includes('Neural')
            );

            // Second: Google voices (usually good quality)
            if (!selectedVoice) {
                selectedVoice = voices.find(v =>
                    v.name.includes('Google') &&
                    (v.name.includes('Female') || v.name.includes('US'))
                );
            }

            // Third: Any female English voice (often sound more natural)
            if (!selectedVoice) {
                selectedVoice = voices.find(v =>
                    v.lang.startsWith('en') &&
                    (v.name.toLowerCase().includes('female') ||
                        v.name.toLowerCase().includes('samantha') ||
                        v.name.toLowerCase().includes('karen') ||
                        v.name.toLowerCase().includes('susan'))
                );
            }

            // Fourth: Any enhanced or high-quality voice
            if (!selectedVoice) {
                selectedVoice = voices.find(v =>
                    v.name.includes('Enhanced') ||
                    v.name.includes('High Quality')
                );
            }

            // Fallback: Any English voice
            if (!selectedVoice && voices.length > 0) {
                selectedVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
            }

            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }

            utterance.lang = 'en-US';

            // Speak it
            window.speechSynthesis.speak(utterance);
        }, 600); // Start reading after alarm starts
    }
}

function closeUrgentAlert() {
    const alert = document.getElementById('urgent-alert');
    if (alert) {
        alert.classList.add('hidden');
        isShowingAlert = false;

        // Show next alert in queue if any
        if (alertQueue.length > 0) {
            const nextAlert = alertQueue.shift();
            const totalRemaining = alertQueue.length + 1; // +1 for the one we're about to show
            const position = totalRemaining > 1 ? (totalRemaining - alertQueue.length) : null;

            setTimeout(() => {
                showUrgentAlert(
                    nextAlert.title,
                    nextAlert.tickers,
                    nextAlert.position || position,
                    nextAlert.total || (totalRemaining > 1 ? totalRemaining : null)
                );
            }, 500); // Small delay between alerts
        }
    }
}

// Process multiple alerts - queue them if needed
function processAlerts(newItems) {
    if (newItems.length === 0) return;

    // If multiple items, show first one and queue the rest
    if (newItems.length === 1) {
        // Single item - show immediately or queue if one is showing
        if (!isShowingAlert) {
            showUrgentAlert(newItems[0].title, newItems[0].tickers);
        } else {
            // Queue it - will show after current one closes
            alertQueue.push({ title: newItems[0].title, tickers: newItems[0].tickers });
        }
    } else {
        // Multiple items - show first, queue rest
        const first = newItems[0];
        const rest = newItems.slice(1);

        if (!isShowingAlert) {
            // Show first with counter
            showUrgentAlert(first.title, first.tickers, 1, newItems.length);
            // Queue the rest
            rest.forEach(item => {
                alertQueue.push({ title: item.title, tickers: item.tickers });
            });
        } else {
            // Already showing one - add all to queue (they'll show in order)
            // Calculate position based on current queue
            const startPosition = alertQueue.length + 2; // +2 because: current alert (1) + queue (alertQueue.length) + these new ones starting at position
            const totalAfter = alertQueue.length + newItems.length + 1; // +1 for currently showing

            newItems.forEach((item, index) => {
                alertQueue.push({
                    title: item.title,
                    tickers: item.tickers,
                    position: startPosition + index,
                    total: totalAfter
                });
            });
        }
    }
}

// Request notification permission on load
if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}

// Load voices for text-to-speech (some browsers need this)
if ('speechSynthesis' in window) {
    // Some browsers need voices to be loaded first
    window.speechSynthesis.getVoices(); // Trigger voice loading
    window.addEventListener('voiceschanged', () => {
        // Voices are now loaded
    });
}

// Fetch data from the server
async function fetchData() {
    try {
        const response = await fetch('/api/feed');
        const data = await response.json();

        keywords = data.keywords || [];
        const newRows = data.rows || [];

        const oldTitles = new Set(seenTitles);
        const newTitles = new Set(); // Track which items are brand new this update

        // On first load, mark ALL existing items as READ so they disappear immediately
        // User only wants to see NEW news that arrives AFTER they start watching
        if (isFirstLoad) {
            newRows.forEach(row => {
                seenTitles.add(row.title);
                markAsRead(row.title); // Mark as read so they don't show at all
            });
            isFirstLoad = false;
            // Don't show anything on first load - clean slate
            allRows = [];
            renderMatched(new Set()); // Empty - show nothing
            updateUnreadCounter();
            return;
        }

        // Only notify if keywords exist AND news matches AND it's truly new
        if (keywords.length > 0) {
            // Collect all new matching items first
            const newMatchingItems = [];

            newRows.forEach(row => {
                const text = (row.title + ' ' + (row.tickers || []).join(' ')).toLowerCase();
                const matches = lowerKeywords.some(k => text.includes(k));

                // Only popup if it matches keywords AND wasn't seen before (truly new) AND not already read
                if (matches && !oldTitles.has(row.title) && !isRead(row.title)) {
                    newMatchingItems.push(row);
                    newTitles.add(row.title); // Mark as new for visual indicator
                }
            });

            // Process alerts (queues multiple items)
            processAlerts(newMatchingItems);
        }
        // If no keywords: no popups, just show in list

        // Track new items that appeared (for visual indicator only, not popups)
        newRows.forEach(row => {
            if (!oldTitles.has(row.title)) {
                newTitles.add(row.title);
            }
            seenTitles.add(row.title);
        });

        allRows = newRows;
        renderMatched(newTitles);
        updateUnreadCounter();

    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('matched-content').innerHTML = '<div class="loading">Error loading feed. Refresh the page.</div>';
    }
}

function getTickerColorClass(ticker) {
    if (ticker.includes('+')) return 'positive';
    if (ticker.includes('-')) return 'negative';
    return '';
}

// Highlight matched keywords in headline for instant recognition
function highlightKeywords(text, keywords) {
    if (!keywords || keywords.length === 0) return escapeHtml(text);

    let highlighted = escapeHtml(text);
    const lowerText = text.toLowerCase();

    keywords.forEach(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        if (lowerText.includes(lowerKeyword)) {
            // Use case-insensitive replacement
            const regex = new RegExp(`(${escapeRegex(keyword)})`, 'gi');
            highlighted = highlighted.replace(regex, '<mark>$1</mark>');
        }
    });

    return highlighted;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Update unread counter
function updateUnreadCounter() {
    const counter = document.getElementById('unread-counter');
    if (!counter) return;

    const unreadCount = allRows.filter(row => !isRead(row.title)).length;
    if (unreadCount > 0) {
        counter.textContent = `${unreadCount} unread`;
        counter.classList.add('has-unread');
    } else {
        counter.textContent = '0 unread';
        counter.classList.remove('has-unread');
    }
}

function renderMatched(newTitles = new Set()) {
    const container = document.getElementById('matched-content');

    if (!keywords || keywords.length === 0) {
        // No keywords: show ALL news
        if (allRows.length === 0) {
            container.innerHTML = '<div class="loading">No keywords configured. Showing all news when available…</div>';
            return;
        }

        // Filter out read items - only show unread news
        const unreadRows = allRows.filter(row => !isRead(row.title));

        if (unreadRows.length === 0) {
            container.innerHTML = '<div class="loading">All news read. Waiting for new items…</div>';
            return;
        }

        // Show only unread news items
        let html = '';
        unreadRows.forEach((row, i) => {
            const isNew = newTitles.has(row.title);
            const itemClass = isNew ? 'news-item new-item' : 'news-item';

            const tickersHtml = row.tickers && row.tickers.length > 0
                ? row.tickers.map(t => {
                    const colorClass = getTickerColorClass(t);
                    return `<span class="ticker ${colorClass}">${escapeHtml(t)}</span>`;
                }).join('')
                : '<span class="ticker">—</span>';

            const timestampHtml = row.timestamp ? `<span class="timestamp">${escapeHtml(row.timestamp)}</span>` : '';
            const newBadge = isNew ? '<span class="new-badge">NEW</span>' : '';

            html += `
                <div class="${itemClass}" data-title="${escapeHtml(row.title)}" data-url="${escapeHtml(row.url || '')}">
                    <span class="news-number">${i + 1}</span>
                    ${newBadge}
                    <div class="tickers">${tickersHtml}</div>
                    <div class="headline">${highlightKeywords(row.title, keywords)}</div>
                ${timestampHtml}
            </div>
        `;
        });

        container.innerHTML = html;

        // Open article in new tab when clicked, then mark as read and remove
        container.querySelectorAll('.news-item').forEach(item => {
            item.addEventListener('click', () => {
                const title = item.dataset.title;
                const url = item.dataset.url;

                if (title) {
                    // Open article in new tab if URL exists
                    if (url) {
                        window.open(url, '_blank');
                    }

                    // Mark as read and remove from view
                    markAsRead(title);
                    item.remove();
                    // Re-render to update numbers and counter
                    renderMatched(newTitles);
                    updateUnreadCounter();
                }
            });
        });

        // Auto-mark as read after 30 seconds and remove from view
        newTitles.forEach(title => {
            setTimeout(() => {
                if (!isRead(title)) {
                    markAsRead(title);
                    // Re-render to remove the item
                    renderMatched(newTitles);
                    updateUnreadCounter();
                }
            }, 30000);
        });

        return;
    }

    const lowerKeywords = keywords.map(k => k.toLowerCase());

    // Deduplicate by title (in case backend sends duplicates)
    const seenInThisRender = new Set();
    const uniqueHits = allRows.filter(row => {
        const text = (row.title + ' ' + (row.tickers || []).join(' ')).toLowerCase();
        const matches = lowerKeywords.some(k => text.includes(k));

        if (matches && !seenInThisRender.has(row.title)) {
            seenInThisRender.add(row.title);
            return true;
        }
        return false;
    });

    // Filter out read items - only show unread matches
    const unreadHits = uniqueHits.filter(row => !isRead(row.title));

    if (unreadHits.length === 0) {
        if (uniqueHits.length === 0) {
            container.innerHTML = `<div class="loading">No matches yet. Watching ${keywords.length} keyword${keywords.length !== 1 ? 's' : ''}…</div>`;
        } else {
            container.innerHTML = `<div class="loading">All matches read. Watching for new items…</div>`;
        }
        return;
    }

    let html = '';
    unreadHits.forEach((row, i) => {
        const isNew = newTitles.has(row.title);
        const itemClass = isNew ? 'news-item new-item' : 'news-item';

        const tickersHtml = row.tickers && row.tickers.length > 0
            ? row.tickers.map(t => {
                const colorClass = getTickerColorClass(t);
                return `<span class="ticker ${colorClass}">${escapeHtml(t)}</span>`;
            }).join('')
            : '<span class="ticker">—</span>';

        const timestampHtml = row.timestamp ? `<span class="timestamp">${escapeHtml(row.timestamp)}</span>` : '';
        const newBadge = isNew ? '<span class="new-badge">NEW</span>' : '';

        html += `
            <div class="${itemClass}" data-title="${escapeHtml(row.title)}" data-url="${escapeHtml(row.url || '')}">
                <span class="news-number">${i + 1}</span>
                ${newBadge}
                <div class="tickers">${tickersHtml}</div>
                <div class="headline">${escapeHtml(row.title)}</div>
                ${timestampHtml}
            </div>
        `;
    });

    container.innerHTML = html;

    // Open article in new tab when clicked, then mark as read and remove
    container.querySelectorAll('.news-item').forEach(item => {
        item.addEventListener('click', () => {
            const title = item.dataset.title;
            const url = item.dataset.url;

            if (title) {
                // Open article in new tab if URL exists
                if (url) {
                    window.open(url, '_blank');
                }

                // Mark as read and remove from view
                markAsRead(title);
                item.remove();
                // Re-render to update numbers
                renderMatched(newTitles);
            }
        });
    });

    // Auto-mark as read after 30 seconds and remove from view
    newTitles.forEach(title => {
        setTimeout(() => {
            if (!isRead(title)) {
                markAsRead(title);
                // Re-render to remove the item
                renderMatched(newTitles);
            }
        }, 30000);
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Keyboard shortcuts for speed
document.addEventListener('keydown', (e) => {
    // Ignore if typing in input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // C = Clear all read items
    if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        clearReadTitles();
    }

    // Esc = Close popup
    if (e.key === 'Escape') {
        closeUrgentAlert();
    }

    // Enter = Open first unread item
    if (e.key === 'Enter' && !e.shiftKey) {
        const firstItem = document.querySelector('.news-item:not(.read-item)');
        if (firstItem) {
            firstItem.click();
        }
    }
});

// Simulate multiple breaking news for testing queue behavior
function simulateNewNews() {
    const urlParams = new URLSearchParams(window.location.search);
    const simulateMode = urlParams.get('simulate') === 'true';

    if (!simulateMode) return;

    // Find multiple keywords to simulate (create 2-4 fake news items at once)
    if (keywords.length === 0) return;

    const numItems = Math.floor(Math.random() * 3) + 2; // 2-4 items
    const selectedKeywords = [];
    for (let i = 0; i < numItems && i < keywords.length; i++) {
        const keyword = keywords[Math.floor(Math.random() * keywords.length)];
        if (!selectedKeywords.includes(keyword)) {
            selectedKeywords.push(keyword);
        }
    }

    const fakeNewsItems = selectedKeywords.map((keyword, index) => ({
        title: `🚨 ${keyword.toUpperCase()} Alert: Major Breaking News - Immediate Action Required`,
        tickers: ['TEST', `SIM${index + 1}`],
        timestamp: '0 min',
        url: 'https://finviz.com',
        fetch_time: Date.now() / 1000
    }));

    // Add to seen titles initially
    fakeNewsItems.forEach(item => {
        seenTitles.add(item.title);
    });

    // Simulate them arriving as "new" news
    setTimeout(() => {
        // Remove from seen so popups trigger
        fakeNewsItems.forEach(item => {
            seenTitles.delete(item.title);
        });

        // Add all to all_rows
        fakeNewsItems.reverse().forEach(item => {
            allRows.unshift(item);
        });

        // Process alerts (will queue multiple items properly)
        processAlerts(fakeNewsItems);

        // Render with these as new
        const newTitles = new Set(fakeNewsItems.map(item => item.title));
        renderMatched(newTitles);
        updateUnreadCounter();

        console.log(`📰 Simulated ${fakeNewsItems.length} breaking news items:`, fakeNewsItems.map(i => i.title));
    }, 2000); // Show after 2 seconds
}

// Poll for updates every 15 seconds
setInterval(fetchData, 15000);
fetchData();

// Auto-simulate if in simulate mode (after initial load)
setTimeout(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('simulate') === 'true') {
        // Simulate multiple news every 15 seconds in simulate mode
        setInterval(simulateNewNews, 15000);
        // First batch after 5 seconds
        setTimeout(simulateNewNews, 5000);
    }
}, 3000);
