FROM oven/bun:1.2.5

WORKDIR /repo

# Copy repo-level package files and workspace sources so workspace deps resolve
COPY package.json ./
COPY packages ./packages
COPY apps/orchestrator ./apps/orchestrator

# Install workspace dependencies (includes @flowdb/* packages)
RUN bun install --no-save

WORKDIR /repo/apps/orchestrator

EXPOSE 3000

ENV NODE_ENV=production

CMD ["bun", "run", "src/main.ts"]
