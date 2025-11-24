const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
const PORT = 3000;

// --- BRIGHTDATA CONFIGURATION ---
const BRD_HOST = 'brd.superproxy.io';
const BRD_PORT = '33335';
const BRD_USER = 'brd-customer-hl_63bece2b-zone-freemium';
const BRD_PASS = '5jakgkya9gr8';

// Construct the Proxy Connection String
// Format: http://user:pass@host:port
const BRIGHTDATA_PROXY = `http://${BRD_USER}:${BRD_PASS}@${BRD_HOST}:${BRD_PORT}`;
// --------------------------------

// Create the Agent once
const agent = new HttpsProxyAgent(BRIGHTDATA_PROXY);

app.get('/', (req, res) => {
    res.send('✅ BrightData Proxy Scraper is Running. Use /search?q=...');
});

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing q parameter" });

    try {
        console.log(`Processing query: "${query}" via BrightData...`);

        const response = await axios.get(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, {
            httpsAgent: agent, // <--- Traffic goes through BrightData
            timeout: 15000,    // 15 seconds timeout
            headers: {
                // "Stealth" Headers to look like a real browser
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.mojeek.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br', 
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        // Parse HTML with Cheerio
        const $ = cheerio.load(response.data);
        
        // Check for blocks
        if ($('title').text().includes('403') || $('body').text().includes('automated queries')) {
            console.log("Blocked by Mojeek (403 Content)");
            return res.status(403).json({ error: "Mojeek detected the proxy." });
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

        // Send JSON Response
        res.json({
            status: "success",
            provider: "brightdata",
            count: items.length,
            results: items
        });

    } catch (error) {
        console.error("Proxy Error:", error.message);
        
        // Handle specific proxy auth errors
        if (error.response && error.response.status === 407) {
            return res.status(407).json({ error: "BrightData Authentication Failed. Check username/password." });
        }

        res.status(500).json({ 
            error: error.message, 
            details: "Failed to fetch via BrightData" 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
