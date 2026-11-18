FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 py3-aiohttp py3-cryptography git && \
    git clone --depth 1 https://github.com/fano0001/home-assistant-mazda.git /tmp/ha-mazda && \
    cp -r /tmp/ha-mazda/custom_components/mazda_cs/pymazda /app/pymazda && \
    test -f /app/pymazda/__init__.py || touch /app/pymazda/__init__.py && \
    rm -rf /tmp/ha-mazda

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

RUN mkdir -p /app/data

EXPOSE 3080

CMD ["node", "src/server.js"]
