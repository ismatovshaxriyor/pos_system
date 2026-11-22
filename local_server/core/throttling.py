from rest_framework.throttling import AnonRateThrottle


class PublicClientThrottle(AnonRateThrottle):
    """
    Mijozlarning QR sayti (`/api/public/*`) uchun limit, har bir mijozga alohida.

    Mijozlar Cloudflare tunnel -> `website` (nginx) -> `web` yo'li bilan keladi,
    shuning uchun `REMOTE_ADDR` hammasida bir xil: `website` konteynerining IP'si.
    Oddiy `AnonRateThrottle` (10/minute) shu sabab butun restoranning QR
    mijozlarini bitta hisobga qamab qo'yardi. Sayt har 15 soniyada stol holatini
    so'raydi, birinchi 429 da demo menyuga tushib, o'sha holatda qolardi
    (Rohat, 2026-11-22). Kalitga `CF-Connecting-IP` qo'shiladi: bu sarlavhani
    Cloudflare o'zi yozadi, nginx esa uni o'zgartirmay uzatadi.

    Restoran LAN'idan to'g'ridan-to'g'ri `:8000` ga murojaat qilgan kishi bu
    sarlavhani soxtalashtirib limitni chetlab o'tishi mumkin. Lekin bu yerdagi
    ma'lumot baribir ommaviy (menyu, stol hisobi). Yozadigan yagona amal -
    ofitsiant chaqirish: ilovalar bir stoldan kelgan takroriy chaqiruvlarni
    bitta oynaga "N marta" deb birlashtiradi, shuning uchun ko'p bosish
    xodimning ekranini to'ldirib yubormaydi.
    """

    scope = 'public'

    def get_ident(self, request):
        remote_addr = request.META.get('REMOTE_ADDR', '')
        cf_ip = request.META.get('HTTP_CF_CONNECTING_IP', '').strip()
        return f'{remote_addr}|{cf_ip}' if cf_ip else remote_addr
