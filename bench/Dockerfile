# Screeps' engine (screeps@4.3) needs Node >= 22.9, and its sandbox (isolated-vm) needs Node 22's V8.
FROM node:22-bookworm

WORKDIR /bench
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY run.js attack.js nodelay.js movement-scenarios.js layout-test.js layout-check.js ./
COPY game ./game

ENTRYPOINT ["node", "run.js"]
