FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

ENV VITE_API_PROXY_TARGET=http://backend:5000

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
