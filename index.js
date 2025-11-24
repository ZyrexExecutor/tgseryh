const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
const PORT = 3000;

// Tor runs on standard port 9050 in the Docker container
const TOR_PROXY = 'socks5://127.0.0.1:9050';
const agent = new SocksProxyAgent(TOR_PROXY);

app.get('/', (req, res) => {
    res.send('✅ Render Tor Scraper is Running. Use /search?q=...');
});

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing q" });

    try {
        console.log(`Searching via Tor: ${query}`);
        
        const response = await axios.get(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, {
            httpsAgent: agent, 
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.mojeek.com/'
            }
        });

        if (response.data.includes('403 - Forbidden')) {
            // Tor IP might be blocked, but Render restarts often so it rotates
            return res.status(403).json({ error: "Tor IP blocked." });
        }

        const $ = cheerio.load(response.data);
        const items = [];
        $('ul.results-standard li').each((i, el) => {
            const title = $(el).find('a.title').text().trim();
            const link = $(el).find('a.title').attr('href');
            if (title && link) items.push({ title, link });
        });

        res.json({ status: "success", count: items.length, results: items });

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Tor connection failed. Is Tor ready?" });
    }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
