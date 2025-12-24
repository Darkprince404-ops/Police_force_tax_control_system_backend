FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json .eslintrc.cjs .prettierrc ./ 
COPY src ./src

RUN npm run build

EXPOSE 4000
CMD ["node", "dist/index.js"]

