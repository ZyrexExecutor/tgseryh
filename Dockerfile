# Use a lightweight Node image
FROM node:18-slim

# 1. Install Tor using the Linux package manager
RUN apt-get update && apt-get install -y tor && rm -rf /var/lib/apt/lists/*

# 2. Setup the App
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# 3. Configure Tor to run in background
# We change the "torrc" config to ensure it uses the default port
RUN echo "SocksPort 9050" > /etc/tor/torrc

# 4. Expose the web port
EXPOSE 3000

# 5. START COMMAND:
# Start Tor in the background (&), wait 20 seconds for it to connect, then start Node
CMD tor -f /etc/tor/torrc & sleep 20 && node index.js
