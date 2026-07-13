.PHONY: cleardata user

# Bola (local_server) bazasidagi barcha ma'lumotlarni tozalaydi,
# lekin sxema (jadvallar/migratsiyalar) saqlanib qoladi.
# Django flush interaktiv tasdiq so'raydi - tasodifiy ishga tushishdan himoya.
cleardata:
	docker compose exec web python manage.py flush

# Yangi superuser (manager) yaratadi - interaktiv (telefon raqam + parol so'raydi).
user:
	docker compose exec web python manage.py createsuperuser
