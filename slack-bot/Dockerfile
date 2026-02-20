FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Run with tsx (TypeScript execution)
CMD ["npx", "tsx", "src/index.ts"]
