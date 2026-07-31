FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm install --include=dev
COPY . .
RUN npm run build

FROM nginx:alpine
# nginx:alpine'ning o'rnatilgan entrypoint'i /etc/nginx/templates/*.template
# fayllarini konteyner ishga tushganda `envsubst` bilan qayta ishlaydi (build
# paytida emas) - shu orqali BACKEND_WEB har bir deploy (cloud_server vs
# local_server) uchun compose'dan turlicha berilishi mumkin bo'ladi, image
# esa ikkalasida ham bir xil qoladi. Default - cloud_server (Ona, web:8001) -
# uning compose fayli hozircha BACKEND_WEB'ni ochiq bermaydi, shuning uchun
# bu default o'sha deploy uchun o'zgarishsiz ishlashni ta'minlaydi;
# local_server o'zining compose'ida buni web:8000'ga ustiga yozadi.
ENV BACKEND_WEB=web:8001
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
