// Devamsızlık (yoklama) takibi: hesap, yoklama penceresi, takvimdeki simgeler ve sağ paneldeki sekme.
// uygulama.js ve donem.js'ten sonra yüklenir; oradaki yardımcıları kullanır (dersler, yoklamaVerisi,
// istekGonder, mesajGoster, eleman, renkBul, ikiOndalik, saatiSayiyaCevir, gunNumarasi, tarihiGoster,
// takvimiCiz, seciliDers, donemEkraniniAc).
//
// Ayarlar app.py'de tek yerde: ATTENDANCE_UNIT, LIMIT_ROUNDING, uyarı eşiği, YOKLAMA_DURUMLARI.

// ============================================================
// DURUM ve SAYFADAKİ PARÇALAR
// ============================================================

let yoklamaKayitlari = new Map();   // "oturum kimliği|tarih" -> durum
let dersDisiGunler = new Set();     // ders yapılmayan günlerin gün numaraları
let pencereListesi = [];            // yoklama penceresinde gösterilen oturumlar (açıldığı andaki bekleyenler)
let acilistaGosterildi = false;     // pencere sayfa açılışı başına bir kez kendiliğinden açılır
let gecmisSatirSayisi = 15;         // paneldeki "Geçmiş oturumlar" listesinde gösterilen satır sayısı

const GUN_ADLARI = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
// Katılım değerinin yüzde mi saat mi gösterileceği tercihi tarayıcıda bu adla saklanır.
const GORUNUM_TERCIHI = "derstakip.katilimGorunumu";

const yoklamaPenceresi = document.getElementById("yoklama-penceresi");
const yoklamaListesi = document.getElementById("yoklama-listesi");
const yoklamaHatasi = document.getElementById("yoklama-hatasi");
const yoklamaKapsulu = document.getElementById("yoklama-kapsulu");
const devamsizlikIcerigi = document.getElementById("devamsizlik-icerigi");

// ============================================================
// VERİ ve HESAP
// ============================================================

// Sunucudan gelen yoklama verisini alır ve hızlı arama için hazırlar.
function yoklamaVerisiniAl(veri) {
    yoklamaVerisi = veri;
    yoklamaKayitlari = new Map(veri.kayitlar.map((kayit) => [`${kayit.oturum_id}|${kayit.tarih}`, kayit.durum]));
    // Ders yapılmayan günler: türü ne olursa olsun (tatil, sınav dönemi, diğer) hepsi aynı sayılır.
    dersDisiGunler = new Set();
    for (const aralik of veri.ders_disi_tarihler) {
        for (let gun = gunNumarasi(aralik.baslangic); gun <= gunNumarasi(aralik.bitis); gun++) dersDisiGunler.add(gun);
    }
}

// Gün numarası -> "2026-10-05"
function gundenTarihe(gun) {
    return new Date(gun * 86400000).toISOString().slice(0, 10);
}

// Tarihin haftanın hangi günü olduğu (Pazartesi 0 ... Pazar 6).
function haftaninGunu(tarih) {
    return (new Date(gunNumarasi(tarih) * 86400000).getUTCDay() + 6) % 7;
}

// Oturumun dönem içinde planlanan bütün tarihleri: dönemin ilk günü ile derslerin SON günü arasında
// (ikisi dahil) oturumun gününe denk gelenler, ders yapılmayan tarihler hariç.
// Final dönemi derslerin son gününden sonra olduğu için kapsam dışıdır. Dönem yoksa boş liste.
function planlananTarihler(oturum) {
    const donem = yoklamaVerisi.donem;
    if (!donem) return [];
    const tarihler = [];
    const ilk = gunNumarasi(donem.baslangic);
    const son = gunNumarasi(donem.bitis);
    // Dönemin ilk gününden sonra oturumun gününe denk gelen ilk tarih, sonra haftada bir.
    const ilkDers = ilk + (oturum.gun - haftaninGunu(donem.baslangic) + 7) % 7;
    for (let gun = ilkDers; gun <= son; gun += 7) {
        if (!dersDisiGunler.has(gun)) tarihler.push(gundenTarihe(gun));
    }
    return tarihler;
}

function oturumPlanliMi(oturum, tarih) {
    return haftaninGunu(tarih) === oturum.gun && planlananTarihler(oturum).includes(tarih);
}

// Oturumun devamsızlık birimi: ATTENDANCE_UNIT "hour" ise süresi (saat), "session" ise 1.
function oturumBirimi(oturum) {
    if (AYARLAR.yoklamaBirimi !== "hour") return 1;
    return saatiSayiyaCevir(oturum.bitis) - saatiSayiyaCevir(oturum.baslangic);
}

function birimAdi() {
    return AYARLAR.yoklamaBirimi === "hour" ? "saat" : "oturum";
}

// Oturumun o günkü dersi bitti mi? ("Şimdi" sunucudan gelir: Mac'in yerel saati.)
function dersBittiMi(oturum, tarih) {
    return `${tarih}T${oturum.bitis}` <= yoklamaVerisi.simdi;
}

function yoklamaDurumu(oturumId, tarih) {
    return yoklamaKayitlari.get(`${oturumId}|${tarih}`) || null;
}

// Oturumun toplam yoklama kaydı sayısı (oturum silinirken onay mesajı için).
function yoklamaKayitSayisi(oturumId) {
    return yoklamaVerisi.kayitlar.filter((kayit) => kayit.oturum_id === oturumId).length;
}

// Bekleyenler: dersi bitmiş ama yoklaması hiç girilmemiş planlanan oturumlar.
// En yeni gün üstte (önce bugün), aynı gün içinde saat sırasıyla.
function bekleyenYoklamalar() {
    const bekleyenler = [];
    for (const ders of dersler) {
        for (const oturum of ders.oturumlar) {
            for (const tarih of planlananTarihler(oturum)) {
                if (dersBittiMi(oturum, tarih) && !yoklamaDurumu(oturum.id, tarih)) {
                    bekleyenler.push({ ders, oturum, tarih });
                }
            }
        }
    }
    return bekleyenler.sort((a, b) => b.tarih.localeCompare(a.tarih)
        || a.oturum.baslangic.localeCompare(b.oturum.baslangic));
}

// İzin verilen devamsızlık: toplam × yüzde / 100, LIMIT_ROUNDING'e göre yuvarlanır (varsayılan aşağı).
function limitHesapla(toplam, yuzde) {
    const ham = Math.round(toplam * yuzde * 1e4) / 1e6;   // küsurat hatalarını temizler
    return AYARLAR.limitYuvarlama === "floor" ? Math.floor(ham) : Math.round(ham);
}

// Dersin devamsızlık durumu. Havuzlar: lab hakkı dolu VE lab oturumu varsa "Teori" ve "Lab" ayrı;
// aksi halde tek havuz "Toplam". Her havuz için bütün sayaçlar burada, tek yerde hesaplanır.
function dersYoklamasi(ders) {
    const labOturumlari = ders.oturumlar.filter((oturum) => oturum.tur === "lab");
    let havuzlar;
    if (ders.lab_devamsizlik_hakki != null && labOturumlari.length > 0) {
        havuzlar = [
            { ad: "Teori", yuzde: ders.devamsizlik_hakki, oturumlar: ders.oturumlar.filter((o) => o.tur !== "lab") },
            { ad: "Lab", yuzde: ders.lab_devamsizlik_hakki, oturumlar: labOturumlari },
        ];
    } else {
        havuzlar = [{ ad: "Toplam", yuzde: ders.devamsizlik_hakki, oturumlar: ders.oturumlar }];
    }

    for (const havuz of havuzlar) {
        Object.assign(havuz, { toplam: 0, gidilen: 0, gidilmeyen: 0, alinmadi: 0, iptal: 0, gecen: 0 });
        for (const oturum of havuz.oturumlar) {
            const birim = oturumBirimi(oturum);
            for (const tarih of planlananTarihler(oturum)) {
                const durum = yoklamaDurumu(oturum.id, tarih);
                if (durum === "iptal") {
                    havuz.iptal += birim;   // iptal edilen ders dönem toplamından düşer
                    continue;
                }
                havuz.toplam += birim;      // "alınmadı" olanlar toplamda kalır
                if (dersBittiMi(oturum, tarih)) havuz.gecen += birim;
                if (durum === "katildi") havuz.gidilen += birim;
                else if (durum === "katilmadi") havuz.gidilmeyen += birim;
                else if (durum === "alinmadi") havuz.alinmadi += birim;
            }
        }
        havuz.kalanDers = havuz.toplam - havuz.gecen;
        // Katılım yüzdesi: gidilen / (gidilen + gidilmeyen). "Alınmadı" ve "iptal" bu hesaba girmez.
        const sayilan = havuz.gidilen + havuz.gidilmeyen;
        havuz.katilimYuzdesi = sayilan > 0 ? havuz.gidilen / sayilan * 100 : null;

        // Sınır: hak girilmemişse limit yoktur (sayaçlar yine gösterilir).
        havuz.limit = havuz.yuzde == null ? null : limitHesapla(havuz.toplam, havuz.yuzde);
        havuz.kalanHak = havuz.limit === null ? null : havuz.limit - havuz.gidilmeyen;
        if (havuz.limit === null) havuz.renk = null;
        else if (havuz.kalanHak <= 0) havuz.renk = "kirmizi";
        else if (havuz.kalanHak <= AYARLAR.uyariKalanBirim
            || havuz.gidilmeyen >= havuz.limit * AYARLAR.uyariKullanimOrani) havuz.renk = "sari";
        else havuz.renk = "yesil";
    }
    return havuzlar;
}

// ============================================================
// KAYDETME
// ============================================================

// Yoklama kayıtlarını ([{oturum_id, tarih, durum}]) sunucuya yazar; başarılıysa eldeki veriyi ve
// ekranı (takvim simgeleri, panel, kapsül, açık pencere) günceller. Başarısızsa false döner.
async function yoklamayiKaydet(kayitlar, hataYeri) {
    try {
        await istekGonder("PUT", "/api/yoklama", { kayitlar });
    } catch (hata) {
        mesajGoster(hataYeri, hata.message);
        return false;
    }
    mesajGoster(hataYeri, "");
    for (const kayit of kayitlar) {
        const mevcut = yoklamaVerisi.kayitlar.find((k) => k.oturum_id === kayit.oturum_id && k.tarih === kayit.tarih);
        if (mevcut) mevcut.durum = kayit.durum;
        else yoklamaVerisi.kayitlar.push({ ...kayit });
        yoklamaKayitlari.set(`${kayit.oturum_id}|${kayit.tarih}`, kayit.durum);
    }
    takvimiCiz();
    if (seciliDers()) devamsizligiCiz(seciliDers());
    yoklamaDurumunuGuncelle();
    return true;
}

// ============================================================
// KAPSÜL, AÇILIŞ PENCERESİ ve DÖNEM UYARISI
// ============================================================

// Dersler ya da yoklama verisi yenilenince çağrılır: kapsülü ve boş paneldeki dönem uyarısını
// günceller; sayfa açılışında bekleyen varsa pencereyi (bir kez) kendiliğinden açar.
function yoklamaDurumunuGuncelle() {
    const bekleyenSayisi = bekleyenYoklamalar().length;
    yoklamaKapsulu.hidden = bekleyenSayisi === 0;
    yoklamaKapsulu.textContent = `Yoklama: ${bekleyenSayisi} bekliyor`;
    // Dönem girilmemişse ve en az bir ders varsa boş paneldeki uyarı kartı görünür.
    document.getElementById("donem-uyari-karti").hidden = yoklamaVerisi.donem !== null || dersler.length === 0;

    if (!acilistaGosterildi) {
        acilistaGosterildi = true;
        if (bekleyenSayisi > 0) yoklamaPenceresiniAc();
    }
}

// Sadece yoklama verisini yeniler ve kapsülü günceller (sekmeye dönünce ve 5 dakikada bir).
// Pencereyi kendiliğinden açmaz, takvimi ve paneli yeniden çizmez.
async function bekleyenleriYenile() {
    try {
        yoklamaVerisiniAl(await istekGonder("GET", "/api/yoklama"));
    } catch {
        return;   // sunucu kapalıysa sessizce geç; bir sonraki denemede düzelir
    }
    const bekleyenSayisi = bekleyenYoklamalar().length;
    yoklamaKapsulu.hidden = bekleyenSayisi === 0;
    yoklamaKapsulu.textContent = `Yoklama: ${bekleyenSayisi} bekliyor`;
}

// ============================================================
// YOKLAMA PENCERESİ
// ============================================================

// "2026-10-05" -> "Pazartesi, 5 Ekim"
function gunBasligi(tarih) {
    const [, ay, gun] = tarih.split("-").map(Number);
    return `${GUN_ADLARI[haftaninGunu(tarih)]}, ${gun} ${AY_ADLARI[ay - 1]}`;
}

function yoklamaPenceresiniAc() {
    pencereListesi = bekleyenYoklamalar();
    if (pencereListesi.length === 0) return;
    mesajGoster(yoklamaHatasi, "");
    yoklamaPenceresiniCiz();
    if (!yoklamaPenceresi.open) yoklamaPenceresi.showModal();
}

// Dört durumlu seçici. yazili: düğmelerde durumun adı mı (pencere) yoksa sadece simgesi mi (panel)?
function durumSecici(oturum, tarih, yazili, hataYeri) {
    const secici = eleman("div", "durum-secici");
    const secili = yoklamaDurumu(oturum.id, tarih);
    for (const durum of AYARLAR.yoklamaDurumlari) {
        const dugme = eleman("button", "", yazili ? durum.ad : durum.simge);
        dugme.type = "button";
        dugme.title = durum.ad;
        dugme.setAttribute("aria-label", durum.ad);
        dugme.setAttribute("aria-pressed", String(durum.anahtar === secili));
        dugme.classList.toggle("secili", durum.anahtar === secili);
        // Basınca hemen kaydedilir; yanlışsa başka bir duruma basarak değiştirilebilir.
        dugme.addEventListener("click", () => {
            yoklamayiKaydet([{ oturum_id: oturum.id, tarih, durum: durum.anahtar }], hataYeri)
                .then(pencereyiYenile);
        });
        secici.appendChild(dugme);
    }
    return secici;
}

// Pencere açıksa yeniden çizer; listedeki her oturum doldurulduysa kendiliğinden kapatır.
function pencereyiYenile() {
    if (!yoklamaPenceresi.open) return;
    yoklamaPenceresiniCiz();
    const kalan = pencereListesi.filter((satir) => !yoklamaDurumu(satir.oturum.id, satir.tarih)).length;
    if (kalan === 0) yoklamaPenceresi.close();
}

function yoklamaPenceresiniCiz() {
    const kalan = pencereListesi.filter((satir) => !yoklamaDurumu(satir.oturum.id, satir.tarih)).length;
    document.getElementById("yoklama-basligi").textContent = `Bekleyen yoklamalar (${kalan})`;
    const bugun = yoklamaVerisi.simdi.slice(0, 10);

    const kaydirma = yoklamaListesi.scrollTop;
    yoklamaListesi.replaceChildren();
    // Tarihe göre gruplar (liste zaten en yeni gün üstte sıralı).
    for (const tarih of [...new Set(pencereListesi.map((satir) => satir.tarih))]) {
        const gununSatirlari = pencereListesi.filter((satir) => satir.tarih === tarih);
        const grup = eleman("section", "yoklama-grubu");
        const baslik = eleman("h3", "", gunBasligi(tarih) + (tarih === bugun ? " · Bugün" : ""));
        const hepsi = eleman("button", "baglanti", "Hepsi katıldım");
        hepsi.type = "button";
        hepsi.addEventListener("click", () => {
            yoklamayiKaydet(gununSatirlari.map((satir) => (
                { oturum_id: satir.oturum.id, tarih, durum: "katildi" })), yoklamaHatasi).then(pencereyiYenile);
        });
        baslik.appendChild(hepsi);
        grup.appendChild(baslik);

        for (const { ders, oturum } of gununSatirlari) {
            const satir = eleman("div", "yoklama-satiri");
            const nokta = eleman("span", "renk-noktasi");
            nokta.style.background = renkBul(ders.renk).kod;
            const bilgi = eleman("div", "yoklama-bilgisi");
            bilgi.appendChild(eleman("strong", "", ders.kod));
            const ayrinti = [`${oturum.baslangic}-${oturum.bitis}`, oturum.derslik];
            if (oturum.tur) ayrinti.push(oturum.tur);
            bilgi.appendChild(eleman("small", "", " · " + ayrinti.join(" · ")));
            satir.append(nokta, bilgi, durumSecici(oturum, tarih, true, yoklamaHatasi));
            grup.appendChild(satir);
        }
        yoklamaListesi.appendChild(grup);
    }
    yoklamaListesi.scrollTop = kaydirma;
}

// Penceredeki bütün oturumları verilen duruma getirir (onay ister).
function tumunuIsaretle(durum) {
    const degisecekler = pencereListesi.filter((satir) => yoklamaDurumu(satir.oturum.id, satir.tarih) !== durum);
    if (degisecekler.length === 0) return;
    const durumAdi = AYARLAR.yoklamaDurumlari.find((d) => d.anahtar === durum).ad;
    if (!confirm(`${degisecekler.length} kayıt değiştirilecek: hepsi “${durumAdi}” olacak. Devam edilsin mi?`)) return;
    yoklamayiKaydet(degisecekler.map((satir) => (
        { oturum_id: satir.oturum.id, tarih: satir.tarih, durum })), yoklamaHatasi).then(pencereyiYenile);
}

// ============================================================
// TAKVİMDE GÖSTERİM
// ============================================================

// Ders bloğunun sol üst köşesine o günün yoklama durumunu gösteren küçük simgeyi ekler.
// Kayıt varsa durumun simgesi; kaydı olmayan geçmiş oturumda sarı "?"; gelecekte simge yok.
// (Simge çekirdek alanın sol üstünde durur: sağ üstteki "⋯" butonuyla çakışmaz, yazıyı kaydırmaz.)
function yoklamaSimgesiEkle(blok, cekirdek, oturum, tarih) {
    if (!oturumPlanliMi(oturum, tarih)) return;
    const durum = AYARLAR.yoklamaDurumlari.find((d) => d.anahtar === yoklamaDurumu(oturum.id, tarih));
    let simge;
    if (durum) {
        simge = eleman("span", "yoklama-simgesi", durum.simge);
        simge.title = `Yoklama: ${durum.ad}`;
        if (durum.anahtar === "iptal") blok.classList.add("iptal");
    } else if (dersBittiMi(oturum, tarih)) {
        simge = eleman("span", "yoklama-simgesi bekliyor", "?");
        simge.title = "Yoklama girilmedi";
    } else {
        return;
    }
    simge.setAttribute("role", "img");
    simge.setAttribute("aria-label", simge.title);
    cekirdek.appendChild(simge);
}

// ============================================================
// SAĞ PANEL: "DEVAMSIZLIK" SEKMESİ
// ============================================================

// Katılım değeri yüzde mi saat mi gösterilsin? Küçük bir arayüz tercihi; tarayıcıda saklanır.
// Saklama alanına ulaşılamazsa (gizli pencere vb.) sessizce varsayılan (yüzde) kullanılır.
function saatGorunumuMu() {
    try {
        return localStorage.getItem(GORUNUM_TERCIHI) === "saat";
    } catch {
        return false;
    }
}

function gorunumuDegistir() {
    try {
        localStorage.setItem(GORUNUM_TERCIHI, saatGorunumuMu() ? "yuzde" : "saat");
    } catch {
        // Tercih saklanamadı; görünüm bu seferlik değişmez.
    }
    if (seciliDers()) devamsizligiCiz(seciliDers());
}

// Dönem ekranının "Akademik takvim" sekmesine götüren bağlantı.
function donemBaglantisi(yazi) {
    const baglanti = eleman("button", "baglanti", yazi);
    baglanti.type = "button";
    baglanti.dataset.donemAc = "";
    return baglanti;
}

// Bir havuzun (Teori / Lab / Toplam) kartı.
function havuzKarti(havuz) {
    const birim = birimAdi();
    const sayi = (deger) => ikiOndalik(deger);
    const kart = eleman("div", "yoklama-karti");
    kart.appendChild(eleman("h3", "", havuz.ad));

    // Büyük değer: "Katılım %83" <-> "Gidilen 10 saat · Gidilmeyen 2 saat"
    if (havuz.katilimYuzdesi === null) {
        kart.appendChild(eleman("div", "katilim-yok", "Henüz veri yok"));
    } else {
        const saatGorunumu = saatGorunumuMu();
        const deger = eleman("button", "katilim-degeri", saatGorunumu
            ? `Gidilen ${sayi(havuz.gidilen)} ${birim} · Gidilmeyen ${sayi(havuz.gidilmeyen)} ${birim}`
            : `Katılım %${Math.round(havuz.katilimYuzdesi * 10) / 10}`);
        deger.type = "button";
        deger.setAttribute("aria-pressed", String(saatGorunumu));
        deger.appendChild(eleman("small", "", saatGorunumu ? "Yüzde için dokun" : "Saat için dokun"));
        deger.addEventListener("click", gorunumuDegistir);
        kart.appendChild(deger);
    }

    const sayaclar = `Dönem toplamı: ${sayi(havuz.toplam)} ${birim} (iptal ve tatiller hariç)`
        + ` · Geçen: ${sayi(havuz.gecen)} · Kalan ders: ${sayi(havuz.kalanDers)}`;
    if (havuz.limit === null) {
        kart.appendChild(eleman("p", "kucuk-not", "Devamsızlık hakkı girilmemiş."));
        kart.appendChild(eleman("p", "kucuk-not", sayaclar));
    } else {
        // Sınır bölümü: renk ve simge birlikte (anlam sadece renge bağlı değil).
        const sinir = eleman("div", `sinir-durumu ${havuz.renk}`);
        const cubuk = eleman("div", "ilerleme");
        const dolu = eleman("span");
        dolu.style.width = `${havuz.limit > 0 ? Math.min(100, havuz.gidilmeyen / havuz.limit * 100) : 100}%`;
        cubuk.appendChild(dolu);
        const simge = { yesil: "✓", sari: "!", kirmizi: "✗" }[havuz.renk];
        sinir.append(cubuk, eleman("strong", "", `${simge} Kullanılan ${sayi(havuz.gidilmeyen)} / ${sayi(havuz.limit)} ${birim}`));
        if (havuz.kalanHak < 0) sinir.appendChild(eleman("p", "", "Devamsızlık sınırı aşıldı."));
        else if (havuz.kalanHak === 0) sinir.appendChild(eleman("p", "", "Hakkın bitti, bir sonraki devamsızlıkta sınırı aşarsın."));
        else if (havuz.renk === "sari") sinir.appendChild(eleman("p", "", "Devamsızlık sınırına yaklaştın."));
        kart.appendChild(sinir);
        kart.appendChild(eleman("p", "kucuk-not", `Kalan hak: ${sayi(havuz.kalanHak)} ${birim} · ${sayaclar}`));
        kart.appendChild(eleman("p", "kucuk-not", `Sınır: %${havuz.yuzde}, en fazla ${sayi(havuz.limit)} ${birim}`));
    }

    const digerleri = [];
    if (havuz.alinmadi > 0) digerleri.push(`Yoklama alınmadı: ${sayi(havuz.alinmadi)} ${birim}`);
    if (havuz.iptal > 0) digerleri.push(`İptal: ${sayi(havuz.iptal)} ${birim}`);
    if (digerleri.length > 0) kart.appendChild(eleman("p", "kucuk-not", digerleri.join(" · ")));
    return kart;
}

// Sekmenin tamamını çizer: (varsa) dönem notu, havuz kartları ve geçmiş oturumlar listesi.
function devamsizligiCiz(ders) {
    const kaydirma = devamsizlikIcerigi.scrollTop;
    devamsizlikIcerigi.replaceChildren();
    const donem = yoklamaVerisi.donem;
    if (!donem) {
        const not = eleman("p", "mesaj uyari", "Yoklama takibi için dönem tarihlerini gir. ");
        not.appendChild(donemBaglantisi("Akademik takvimi aç"));
        devamsizlikIcerigi.appendChild(not);
        return;
    }
    if (yoklamaVerisi.simdi.slice(0, 10) < donem.baslangic) {
        devamsizlikIcerigi.appendChild(eleman("p", "kucuk-not", `Dönem ${tarihiGoster(donem.baslangic)} tarihinde başlıyor.`));
    }
    for (const havuz of dersYoklamasi(ders)) devamsizlikIcerigi.appendChild(havuzKarti(havuz));

    // Geçmiş oturumlar: dersi bitmiş planlanan oturumlar, en yeni üstte. Buradan değiştirilebilir.
    const gecmis = [];
    for (const oturum of ders.oturumlar) {
        for (const tarih of planlananTarihler(oturum)) {
            if (dersBittiMi(oturum, tarih)) gecmis.push({ oturum, tarih });
        }
    }
    gecmis.sort((a, b) => b.tarih.localeCompare(a.tarih) || b.oturum.baslangic.localeCompare(a.oturum.baslangic));
    if (gecmis.length > 0) {
        const bolum = eleman("section", "gecmis-oturumlar");
        bolum.appendChild(eleman("h3", "", "Geçmiş oturumlar"));
        const hataYeri = eleman("p", "mesaj hata");
        hataYeri.hidden = true;
        for (const { oturum, tarih } of gecmis.slice(0, gecmisSatirSayisi)) {
            const satir = eleman("div", "gecmis-satiri");
            const bilgi = eleman("div", "", tarihiGoster(tarih));
            bilgi.appendChild(eleman("small", "", [`${oturum.baslangic}-${oturum.bitis}`, oturum.tur].filter(Boolean).join(" · ")));
            satir.append(bilgi, durumSecici(oturum, tarih, false, hataYeri));
            bolum.appendChild(satir);
        }
        bolum.appendChild(hataYeri);
        if (gecmis.length > gecmisSatirSayisi) {
            const dahaFazla = eleman("button", "satir-ekle", "Daha fazla göster");
            dahaFazla.type = "button";
            dahaFazla.addEventListener("click", () => {
                gecmisSatirSayisi += 15;
                devamsizligiCiz(ders);
            });
            bolum.appendChild(dahaFazla);
        }
        devamsizlikIcerigi.appendChild(bolum);
    }
    devamsizlikIcerigi.scrollTop = kaydirma;
}

// ============================================================
// OLAYLAR
// ============================================================

yoklamaKapsulu.addEventListener("click", yoklamaPenceresiniAc);
document.getElementById("yoklama-kapat").addEventListener("click", () => yoklamaPenceresi.close());
document.getElementById("yoklama-sonra").addEventListener("click", () => yoklamaPenceresi.close());
document.getElementById("yoklama-tumu-katildi").addEventListener("click", () => tumunuIsaretle("katildi"));
document.getElementById("yoklama-tumu-alinmadi").addEventListener("click", () => tumunuIsaretle("alinmadi"));

// "Akademik takvimi aç" bağlantıları (boş paneldeki uyarı kartı ve Devamsızlık sekmesi):
// Dönem ekranı "Akademik takvim" sekmesinde açılır.
document.getElementById("yan-panel").addEventListener("click", (olay) => {
    if (olay.target.closest("[data-donem-ac]")) donemEkraniniAc();
});

// Sekmeye geri dönülünce ve 5 dakikada bir bekleyenler yeniden hesaplanır (sadece kapsül güncellenir).
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") bekleyenleriYenile();
});
setInterval(bekleyenleriYenile, 5 * 60 * 1000);
