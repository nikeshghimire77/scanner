let allRows = [];
let keywords = [];
let seenTitles = new Set();

// Show urgent alert popup
function showUrgentAlert(title, tickers) {
    const alert = document.getElementById('urgent-alert');
    const tickersEl = document.getElementById('urgent-tickers');
    const titleEl = document.getElementById('urgent-title');

    if (!alert) return;

    const tickerStr = tickers && tickers.length > 0 ? tickers.join(', ') : 'News';
    tickersEl.textContent = tickerStr;
    titleEl.textContent = title;

    alert.classList.remove('hidden');

    // Play alert sound - beep beep
    try {
        let audioContext = window.audioContext;
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            window.audioContext = audioContext;
        }

        // Resume context if suspended (browser autoplay policy)
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        // Play 3 beeps
        [0, 150, 300].forEach((delay, i) => {
            setTimeout(() => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = 800 + (i * 100);
                oscillator.type = 'sine';

                gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.2);
            }, delay);
        });
    } catch (e) {
        console.error('Sound error:', e);
    }

    // Browser notification too
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`🚨 URGENT: ${tickerStr}`, { body: title });
    }
}

function closeUrgentAlert() {
    const alert = document.getElementById('urgent-alert');
    if (alert) {
        alert.classList.add('hidden');
    }
}

// Request notification permission on load
if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}

// Fetch data from the server
async function fetchData() {
    try {
        const response = await fetch('/api/feed');
        const data = await response.json();

        keywords = data.keywords || [];
        const newRows = data.rows || [];

        // Check for new matches
        if (keywords.length > 0) {
            const lowerKeywords = keywords.map(k => k.toLowerCase());
            const oldTitles = new Set(seenTitles);

            newRows.forEach(row => {
                const text = (row.title + ' ' + (row.tickers || []).join(' ')).toLowerCase();
                const matches = lowerKeywords.some(k => text.includes(k));

                if (matches && !oldTitles.has(row.title)) {
                    showUrgentAlert(row.title, row.tickers);
                    seenTitles.add(row.title);
                }
            });
        }

        // Update seen titles from all new rows
        newRows.forEach(row => {
            seenTitles.add(row.title);
        });

        allRows = newRows;
        renderMatched();

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

function renderMatched() {
    const container = document.getElementById('matched-content');

    if (!keywords || keywords.length === 0) {
        container.innerHTML = '<div class="loading">No keywords configured. Edit keywords.txt to start filtering.</div>';
        return;
    }

    const lowerKeywords = keywords.map(k => k.toLowerCase());
    const hits = allRows.filter(row => {
        const text = (row.title + ' ' + (row.tickers || []).join(' ')).toLowerCase();
        return lowerKeywords.some(k => text.includes(k));
    });

    if (hits.length === 0) {
        container.innerHTML = `<div class="loading">No matches yet. Watching for: ${keywords.join(', ')}</div>`;
        return;
    }

    let html = '';
    hits.forEach((row, i) => {
        const tickersHtml = row.tickers && row.tickers.length > 0
            ? row.tickers.map(t => {
                const colorClass = getTickerColorClass(t);
                return `<span class="ticker ${colorClass}">${escapeHtml(t)}</span>`;
            }).join('')
            : '<span class="ticker">—</span>';

        const timestampHtml = row.timestamp ? `<span class="timestamp">${escapeHtml(row.timestamp)}</span>` : '';

        html += `
            <div class="news-item">
                <span class="news-number">${i + 1}</span>
                <div class="tickers">${tickersHtml}</div>
                <div class="headline">${escapeHtml(row.title)}</div>
                ${timestampHtml}
            </div>
        `;
    });

    container.innerHTML = html;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Poll for updates every 15 seconds
setInterval(fetchData, 15000);
fetchData();
