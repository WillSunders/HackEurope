FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend ./backend
COPY frontend ./frontend

ENV PORT=4242
EXPOSE 4242

WORKDIR /app/backend
CMD ["npm", "start"]
