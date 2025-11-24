const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
const PORT = 3000;

// 1. YOUR PROXY SOURCE
const PROXY_LIST_URL = 'https://api.proxyscrape.com/?request=displayproxies&proxytype=https';

// Global variable to store proxies
let proxyList = [];

// Function to update proxy list (runs on startup and every 10 mins)
async function updateProxies() {
    try {
        console.log("Fetching fresh proxies...");
        const response = await axios.get(PROXY_LIST_URL);
        const text = response.data;
        // Split by new line and remove empty lines
        proxyList = text.split('\n').map(p => p.trim()).filter(p => p);
        console.log(`Loaded ${proxyList.length} proxies.`);
    } catch (e) {
        console.error("Failed to fetch proxy list:", e.message);
    }
}

// Update proxies immediately, then every 10 minutes
updateProxies();
setInterval(updateProxies, 600000);

// Helper: Get a random proxy
function getRandomProxy() {
    if (proxyList.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * proxyList.length);
    return `http://${proxyList[randomIndex]}`;
}

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing q parameter" });

    // 2. RETRY LOGIC (Try up to 5 different proxies)
    let attempts = 0;
    const maxAttempts = 5;
    let success = false;
    let resultData = null;

    while (attempts < maxAttempts && !success) {
        attempts++;
        const currentProxy = getRandomProxy();
        
        if (!currentProxy) {
             return res.status(503).json({ error: "No proxies available." });
        }

        try {
            console.log(`[Attempt ${attempts}] Trying proxy: ${currentProxy} for query "${query}"`);
            
            const agent = new HttpsProxyAgent(currentProxy);

            const response = await axios.get(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, {
                httpsAgent: agent, // Use the proxy
                timeout: 5000,     // 5 second timeout (public proxies are slow, kill them fast if they hang)
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://www.mojeek.com/',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Connection': 'keep-alive'
                }
            });

            // If we get here, the proxy worked!
            const $ = cheerio.load(response.data);
            
            // Check if we actually got results or a block page
            if ($('title').text().includes('403') || $('body').text().includes('automated queries')) {
                throw new Error("Proxy was blocked by Mojeek");
            }

            const items = [];
            $('ul.results-standard li').each((i, el) => {
                const title = $(el).find('a.title').text().trim();
                const link = $(el).find('a.title').attr('href');
                let snippet = $(el).find('p.s').text().trim();

                // Fallback snippet logic
                if (!snippet) {
                    const rawText = $(el).text();
                    if (rawText.includes('</h2>')) {
                         snippet = rawText.split('</h2>')[1].replace(/See more results.*/, '').trim().substring(0, 300);
                    }
                }

                if (title && link) {
                    items.push({ title, link, snippet });
                }
            });

            resultData = items;
            success = items.length > 0; // Only consider success if we found items

            if (!success) {
                 console.log("Proxy connected but found no results (suspicious). Retrying...");
            }

        } catch (err) {
            console.log(`[Attempt ${attempts}] Proxy failed: ${err.message}`);
            // Loop continues to next proxy
        }
    }

    if (success) {
        res.json({
            status: "success",
            attempts_used: attempts,
            results: resultData
        });
    } else {
        res.status(500).json({
            status: "failed",
            message: "Tried 5 proxies and all failed or were blocked. Try again.",
            hint: "Public proxies are unstable."
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
