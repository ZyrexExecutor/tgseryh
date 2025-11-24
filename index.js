const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
const PORT = 3000;

// --- THE MEGA PROXY POOL ---
// We aggregate from multiple free API sources to get volume
const PROXY_SOURCES = [
    'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=5000&country=all&ssl=yes&anonymity=elite',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt'
];

let proxyPool = [];

// Function to download and merge ALL lists
async function refreshProxyPool() {
    console.log("🔄 Refreshing Mega Proxy Pool...");
    let newPool = new Set(); // Use Set to avoid duplicates

    for (const source of PROXY_SOURCES) {
        try {
            const response = await axios.get(source, { timeout: 5000 });
            const lines = response.data.split(/[\r\n]+/);
            
            lines.forEach(line => {
                // Basic validation: IP:PORT format
                if (line.includes(':') && !line.includes('github')) {
                    newPool.add(line.trim());
                }
            });
        } catch (e) {
            console.log(`Failed to fetch from ${source}`);
        }
    }

    proxyPool = Array.from(newPool);
    console.log(`✅ Total Unique Proxies Loaded: ${proxyPool.length}`);
}

// Refresh immediately, then every 5 minutes (Free proxies die fast)
refreshProxyPool();
setInterval(refreshProxyPool, 300000);


app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing q" });

    // For 100k/day, we need aggressive retry logic
    // We will try up to 20 proxies per user request before giving up
    const maxAttempts = 20; 
    let attempts = 0;
    let success = false;

    while (attempts < maxAttempts && !success) {
        attempts++;
        
        // Pick a random proxy from the massive pool
        if (proxyPool.length === 0) await refreshProxyPool();
        const proxyStr = proxyPool[Math.floor(Math.random() * proxyPool.length)];
        const proxyUrl = `http://${proxyStr}`;

        try {
            // Short timeout (3s). If a proxy is slow, kill it and move on.
            // Volume requires speed, not patience.
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3500);

            const agent = new HttpsProxyAgent(proxyUrl);

            const response = await axios.get(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, {
                httpsAgent: agent,
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://www.mojeek.com/',
                    'Connection': 'keep-alive'
                }
            });
            
            clearTimeout(timeout);

            // Validation: Check if we actually got the page or a block
            if (response.status === 200 && !response.data.includes('403 - Forbidden')) {
                
                const $ = cheerio.load(response.data);
                const items = [];

                $('ul.results-standard li').each((i, el) => {
                    const title = $(el).find('a.title').text().trim();
                    const link = $(el).find('a.title').attr('href');
                    let snippet = $(el).find('p.s').text().trim();
                    if (!snippet) {
                         const raw = $(el).text();
                         if(raw.includes('</h2>')) snippet = raw.split('</h2>')[1].replace(/See more results.*/, '').trim().substring(0, 200);
                    }
                    if (title && link) items.push({ title, link, snippet });
                });

                if (items.length > 0) {
                    success = true;
                    return res.json({ 
                        status: "success", 
                        proxy: proxyStr, 
                        attempts_needed: attempts, 
                        results: items 
                    });
                }
            }

        } catch (e) {
            // Silent catch. We expect 90% failure. Just loop again.
        }
    }

    res.status(503).json({ error: "Network busy, please retry." });
});

app.listen(PORT, () => console.log(`High Volume Scraper running on ${PORT}`));
