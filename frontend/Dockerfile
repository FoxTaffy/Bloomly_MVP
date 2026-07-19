FROM node:20-alpine as build-stage
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . ./
RUN npx vite build

FROM nginx:stable-alpine as production-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
