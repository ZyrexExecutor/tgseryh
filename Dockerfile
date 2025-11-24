# Use Node 20 (Fixes the "File is not defined" error)
# We use 'bullseye' instead of 'slim' because it has better library support for Tor
FROM node:20-bullseye

# 1. Install Tor
RUN apt-get update && apt-get install -y tor && rm -rf /var/lib/apt/lists/*

# 2. Setup App
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# 3. Configure Tor
# Generate a basic torrc file to ensure it listens on port 9050
RUN echo "SocksPort 0.0.0.0:9050" > /etc/tor/torrc
RUN echo "ControlPort 9051" >> /etc/tor/torrc

# 4. Expose Ports
EXPOSE 3000

# 5. Start Command
# We start Tor in background, wait 25s for bootstrap, then start Node
CMD tor -f /etc/tor/torrc & sleep 25 && node index.js
