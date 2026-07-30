import React, { useState } from 'react';
import { ShieldCheck, Printer, Smartphone, RefreshCw, Zap, CreditCard, X, CheckCircle2 } from 'lucide-react';

export default function Features() {
  const [selectedFeature, setSelectedFeature] = useState(null);

  const featuresList = [
    {
      id: 1,
      icon: ShieldCheck,
      title: "Internet O'chsa Ham To'xtovsiz Kassa",
      desc: "Internet kunlab uzilib qolsa ham kassa va sotuv to'xtamaydi. Barcha buyurtmalar, hisob-kitoblar va cheklar mahalliy xotirada 100% xavfsiz saqlanadi.",
      tag: "Offlayn Ishonchlilik",
      details: [
        "Internet o'chganda kassa avtomatik offlayn rejimga o'tadi.",
        "Mijozlarga chek berish va to'lovlarni qabul qilish uzluksiz davom etadi.",
        "Internet qaytgach, barcha sotuvlar avtomatik markaziy serverga sinxronlanadi.",
        "Ma'lumotlar yo'qolishi yoki to'qnashuvi 100% oldi olingan."
      ]
    },
    {
      id: 2,
      icon: Printer,
      title: "Oshxona va Bar Chek Printerlari",
      desc: "Taom toifalari bo'yicha (Milliy taomlar, Kabobxona, Bar) tegishli oshxona printerlariga biletlar soniyada yetkaziladi va o'zbek-lotin alifbosida chop etiladi.",
      tag: "Oshxona Nazorati",
      details: [
        "Afitsiant buyurtma olgan zahoti oshxona printeridan chek chiqadi.",
        "Issiq taomlar, ichimliklar va shashliklar alohida printerlarga ajratiladi.",
        "O'zbekcha harflar (O', G', SH, CH) va taom izohlari to'g'ri chop etiladi.",
        "Printer qog'ozi tugasa yoki o'chsa, tizim kassa va afitsiantga ogohlantirish beradi."
      ]
    },
    {
      id: 3,
      icon: Smartphone,
      title: "PIN-Kod va Xodimlar Xavfsizligi",
      desc: "Xodimlar faqat menejer tasdiqlagan kassa qurilmasi va shaxsiy PIN-kod orqali tizimga kiradi. Ruxsatsiz aralashuvlar va kassadan pul kamayishi oldi olinadi.",
      tag: "Xavfsizlik",
      details: [
        "Har bir kassa xodimi va afitsiantga shaxsiy 4-6 xonali PIN-kod beriladi.",
        "Menejer ruxsatisiz chekni bekor qilish yoki chegirma berish taqiqlanadi.",
        "Har bir amaliyot qaysi xodim tomonidan bajarilgani jurnalga yoziladi.",
        "Nomalum qurilmalardan kirishga yo'l qo'yilmaydi."
      ]
    },
    {
      id: 4,
      icon: RefreshCw,
      title: "Masofaviy Sotuv Nazorati",
      desc: "Dunyoning istalgan nuqtasidan hamrohpos.uz saytiga kirib, restoraningiz tushumi, sotilgan taomlar va kunlik foydani telefoningizda ko'rib turasiz.",
      tag: "Masofaviy Boshqaruv",
      details: [
        "Telefon yoki kompyuter orqali kunlik va oylik tushumni jonli kuzatish.",
        "Filiallar o'rtasidagi sotuv dinamikasini solishtirish va tahlil qilish.",
        "Eng ko me'da sotilayotgan taomlar va foyda marjasini ko'rish.",
        "Menyudagi narxlarni masofadan turib yangilash imkoniyati."
      ]
    },
    {
      id: 5,
      icon: Zap,
      title: "Zudlik Bilan Ishlov Berish",
      desc: "Buyurtma olingan zahoti oshxona va bar printerida avtomatik chop etiladi. Afitsiant va kassa o'rtasida hech qanday kechikish bo'lmaydi.",
      tag: "Tezkorlik",
      details: [
        "Stollar holati va bandligi kassa ekranida bir zumda yangilanadi.",
        "Afitsiant planchetdan yuborgan buyurtma 0.3 soniyada kassa va oshxonaga yetadi.",
        "Kassa navbatlari yo'qoladi va mijozlarga xizmat ko'rsatish 2 baravar tezlashadi.",
        "Stol hisobini bo'lish va ko'chirish soniyalarda bajariladi."
      ]
    },
    {
      id: 6,
      icon: CreditCard,
      title: "Aralash To'lovlar va Qarz Daftari",
      desc: "Bitta hisobni naqd va karta aralash yopish, mijozlarga chegirmalar berish hamda doimiy mijozlarning qarz daftarini aniq yuritish.",
      tag: "Moliya",
      details: [
        "Bitta mijoz hisobini bir vaqtning o'zida naqd, Uzcard/Humo va Click bilan to'lash.",
        "Doimiy va VIP mijozlar uchun maxsus qarz daftari va limitlar belgilash.",
        "Aksiyalar va sodiqlik dasturi bo me'yicha avtomatik chegirmalar.",
        "Smena yopilganda Naqd va Karta tushumlari bo'yicha aniq Z-hisobot."
      ]
    }
  ];

  return (
    <section id="imkoniyatlar" className="py-24 relative overflow-hidden bg-[#0A1F44]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <span className="text-xs font-mono text-[#0077CC] uppercase tracking-widest px-3 py-1 rounded-full border border-[#0077CC]/30 bg-[#0077CC]/10">
            Nega Aynan Hamroh POS?
          </span>
          <h2 className="font-serif-display text-3xl sm:text-5xl font-bold text-gradient-gold">
            Restoraningiz Silliq va Uzluksiz Ishlashi Uchun Barcha Imkoniyatlar
          </h2>
          <p className="text-[#5C9FD6] text-base leading-relaxed">
            Biz oddiy kassa dasturi emas, internet bo'lmasa ham to'xtamaydigan ishonchli kassa va masofaviy nazorat tizimini taqdim etamiz.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuresList.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.id}
                onClick={() => setSelectedFeature(f)}
                className="glass-card glass-card-hover p-8 rounded-2xl flex flex-col justify-between space-y-4 border-[#0077CC]/20 cursor-pointer group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0077CC]/20 to-[#5C9FD6]/10 flex items-center justify-center border border-[#0077CC]/40 transition-transform group-hover:scale-110">
                      <Icon className="w-6 h-6 text-[#0077CC]" />
                    </div>
                    <span className="text-[10px] font-mono text-[#0077CC] bg-[#0077CC]/10 px-2.5 py-1 rounded-md border border-[#0077CC]/20">
                      {f.tag}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white font-serif-display group-hover:text-[#0077CC] transition-colors">
                    {f.title}
                  </h3>

                  <p className="text-xs text-[#5C9FD6]/80 leading-relaxed">
                    {f.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#5C9FD6]/10 flex items-center justify-between text-xs font-mono text-[#0077CC] group-hover:translate-x-1 transition-transform">
                  <span>Batafsil ko'rish</span>
                  <span>→</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Feature Detail Modal */}
      {selectedFeature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A1F44]/80 backdrop-blur-md animate-fadeIn">
          <div className="glass-card rounded-3xl max-w-lg w-full p-6 sm:p-8 gold-border-glow relative border-[#0077CC]/50 shadow-2xl space-y-6">
            
            {/* Close Button */}
            <button
              onClick={() => setSelectedFeature(null)}
              className="absolute top-5 right-5 p-2 rounded-xl text-[#5C9FD6] hover:text-[#0077CC] hover:bg-[#14356F]/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#0077CC]/20 flex items-center justify-center border border-[#0077CC] shrink-0">
                {React.createElement(selectedFeature.icon, { className: "w-7 h-7 text-[#0077CC]" })}
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#0077CC] bg-[#0077CC]/10 px-2.5 py-0.5 rounded-md border border-[#0077CC]/20">
                  {selectedFeature.tag}
                </span>
                <h3 className="font-serif-display text-xl font-bold text-white mt-1">
                  {selectedFeature.title}
                </h3>
              </div>
            </div>

            <p className="text-xs text-[#5C9FD6] leading-relaxed border-b border-[#5C9FD6]/10 pb-4 font-sans-body">
              {selectedFeature.desc}
            </p>

            {/* Bullet Points */}
            <div className="space-y-3 font-mono text-xs text-[#FFFFFF]">
              <h4 className="text-[#0077CC] font-bold uppercase text-[11px]">Asosiy Afzalliklari:</h4>
              {selectedFeature.details.map((detail, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#0077CC] shrink-0 mt-0.5" />
                  <span className="leading-normal">{detail}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setSelectedFeature(null)}
              className="w-full btn-gold py-3 rounded-xl text-xs font-bold font-mono uppercase tracking-wider"
            >
              Tushunarli (Yopish)
            </button>

          </div>
        </div>
      )}
    </section>
  );
}
