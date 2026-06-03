FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ bash

WORKDIR /repo

# Preserve the repo-relative TypeScript config path used by the dashboard.
COPY tsconfig.base.json ./
COPY apps/dashboard/package.json apps/dashboard/package-lock.json* ./apps/dashboard/
COPY apps/dashboard/ ./apps/dashboard/

# Install dependencies (including dev deps needed for build) and build.
# Use `npm install` to support repositories without a package-lock.json.
WORKDIR /repo/apps/dashboard
RUN npm install
RUN npm run build

FROM node:20-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /repo/apps/dashboard/.next ./.next
COPY --from=builder /repo/apps/dashboard/node_modules ./node_modules
COPY --from=builder /repo/apps/dashboard/package.json ./

USER app

ENV PORT=3001
EXPOSE 3001

CMD ["npm", "start"]
