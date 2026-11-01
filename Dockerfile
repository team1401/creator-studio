# Matches the locally exercised node:sqlite runtime. No npm/runtime dependencies.
FROM node:26.7.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public/ ./public/
ENV NODE_ENV=production STUDIO_DATA=/data PORT=4180 STUDIO_PASSWORD_FILE=/run/secrets/studio_password
USER node
# Loopback listener: use the reviewed Linux host-network private proxy layout.
CMD ["node", "server.mjs"]
