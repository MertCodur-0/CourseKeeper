// Devamsızlık (yoklama) takibi: hesap, yoklama penceresi, takvimdeki simgeler ve sağ paneldeki sekme.
// uygulama.js ve donem.js'ten sonra yüklenir; oradaki yardımcıları kullanır (dersler, yoklamaVerisi,
// istekGonder, mesajGoster, eleman, renkBul, ikiOndalik, saatiSayiyaCevir, gunNumarasi, tarihiGoster,
// takvimiCiz, seciliDers, donemEkraniniAc).
//
// Yoklama saat saat tutulur: her kayıt bir oturumun belirli bir tarihteki bir saatlik DİLİMİ içindir
// (dilimin kimliği başlangıç saatidir, ör. "09:00"). Oturumun saati sonradan değişirse eski saatlerin
// kayıtları silinmez ama hesaba katılmaz; yeni saatler "kaydı yok" sayılır.
//
// Ayarlar app.py'de tek yerde: LIMIT_ROUNDING, uyarı eşiği, YOKLAMA_DURUMLARI, KARISIK_SIMGESI.

// ============================================================
// DURUM ve SAYFADAKİ PARÇALAR
// ============================================================

let yoklamaKayitlari = new Map();   // "oturum kimliği|tarih|dilim" -> durum
let saatSaatTercihi = new Map();    // "oturum kimliği|tarih" -> "Saat saat" bölümünü kullanıcı açtı mı (true/false)
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
const devamsizlikIcerigi = document.getElementById("devamsizlik-icerigi");

// ============================================================
// VERİ ve HESAP
// ============================================================

// Sunucudan gelen yoklama verisini alır ve hızlı arama için hazırlar.
function yoklamaVerisiniAl(veri) {
    yoklamaVerisi = veri;
    yoklamaKayitlari = new Map(veri.kayitlar.map((kayit) => (
        [`${kayit.oturum_id}|${kayit.tarih}|${kayit.dilim}`, kayit.durum])));
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

// 9.5 -> "09:30"
function saatDakikaYazisi(saat) {
    const dakika = Math.round(saat * 60);
    return `${String(Math.floor(dakika / 60)).padStart(2, "0")}:${String(dakika % 60).padStart(2, "0")}`;
}

// Oturumun bir saatlik dilimleri: 09:00-11:00 -> [{09:00, 10:00}, {10:00, 11:00}].
// Süre tam saat değilse dilim sayısı yukarı yuvarlanır; en az bir dilim vardır (app.py: oturum_dilimleri).
function oturumDilimleri(oturum) {
    const ilk = saatiSayiyaCevir(oturum.baslangic);
    const sayi = Math.max(1, Math.ceil(saatiSayiyaCevir(oturum.bitis) - ilk - 1e-9));
    const dilimler = [];
    for (let sira = 0; sira < sayi; sira++) {
        dilimler.push({
            baslangic: saatDakikaYazisi(ilk + sira),
            bitis: sira === sayi - 1 ? oturum.bitis : saatDakikaYazisi(ilk + sira + 1),
        });
    }
    return dilimler;
}

// Devamsızlık birimi: ders saati (her dilim 1 saat).
function birimAdi() {
    return "saat";
}

// Oturumun o günkü dersi (son dilimiyle birlikte) bitti mi? ("Şimdi" sunucudan gelir: Mac'in yerel saati.)
function dersBittiMi(oturum, tarih) {
    return `${tarih}T${oturum.bitis}` <= yoklamaVerisi.simdi;
}

function dilimBittiMi(dilim, tarih) {
    return `${tarih}T${dilim.bitis}` <= yoklamaVerisi.simdi;
}

function dilimDurumu(oturumId, tarih, dilimBaslangici) {
    return yoklamaKayitlari.get(`${oturumId}|${tarih}|${dilimBaslangici}`) || null;
}

// Oturumun o tarihteki yoklaması, dilim dilim:
//   dilimler : [{baslangic, bitis, durum}] (kaydı olmayan dilimin durumu null)
//   eksik    : kaydı olmayan dilim sayısı
//   ortak    : bütün dilimlerin kaydı var ve hepsi aynıysa o durum, değilse null
//   karisik  : kayıtlı dilimler arasında farklı durumlar var mı
function oturumYoklamasi(oturum, tarih) {
    const dilimler = oturumDilimleri(oturum).map((dilim) => (
        { ...dilim, durum: dilimDurumu(oturum.id, tarih, dilim.baslangic) }));
    const kayitlilar = dilimler.filter((dilim) => dilim.durum).map((dilim) => dilim.durum);
    const eksik = dilimler.length - kayitlilar.length;
    const cesit = new Set(kayitlilar).size;
    return { dilimler, eksik, ortak: eksik === 0 && cesit === 1 ? kayitlilar[0] : null, karisik: cesit > 1 };
}

function durumBul(anahtar) {
    return AYARLAR.yoklamaDurumlari.find((durum) => durum.anahtar === anahtar);
}

// Dilimlerin kısa özeti. Saatli: "09:00 katıldı · 10:00 katılmadı"; değilse "1. saat katıldı · 2. saat katılmadı".
function dilimOzeti(yoklama, saatli) {
    return yoklama.dilimler.map((dilim, sira) => (
        `${saatli ? dilim.baslangic : `${sira + 1}. saat`} ${dilim.durum ? durumBul(dilim.durum).ozet : "girilmedi"}`
    )).join(" · ");
}

// Oturumun toplam (saatlik) yoklama kaydı sayısı (oturum silinirken onay mesajı için).
function yoklamaKayitSayisi(oturumId) {
    return yoklamaVerisi.kayitlar.filter((kayit) => kayit.oturum_id === oturumId).length;
}

// Bekleyenler: dersi bitmiş ama en az bir saatinin yoklaması girilmemiş planlanan oturumlar
// (kısmen doldurulmuş oturum, tamamlanana kadar bekler).
// En yeni gün üstte (önce bugün), aynı gün içinde saat sırasıyla.
function bekleyenYoklamalar() {
    const bekleyenler = [];
    for (const ders of dersler) {
        for (const oturum of ders.oturumlar) {
            for (const tarih of planlananTarihler(oturum)) {
                if (dersBittiMi(oturum, tarih) && oturumYoklamasi(oturum, tarih).eksik > 0) {
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
// Birim dilimdir (1 saat): her dilim kendi durumuyla sayılır.
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
            const dilimler = oturumDilimleri(oturum);
            for (const tarih of planlananTarihler(oturum)) {
                for (const dilim of dilimler) {
                    const durum = dilimDurumu(oturum.id, tarih, dilim.baslangic);
                    if (durum === "iptal") {
                        havuz.iptal += 1;   // iptal edilen saat dönem toplamından düşer
                        continue;
                    }
                    havuz.toplam += 1;      // "alınmadı" olanlar toplamda kalır
                    if (dilimBittiMi(dilim, tarih)) havuz.gecen += 1;
                    if (durum === "katildi") havuz.gidilen += 1;
                    else if (durum === "katilmadi") havuz.gidilmeyen += 1;
                    else if (durum === "alinmadi") havuz.alinmadi += 1;
                }
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

// Yoklama kayıtlarını ([{oturum_id, tarih, dilim, durum}]) sunucuya yazar; başarılıysa eldeki veriyi ve
// ekranı (takvim simgeleri, panel, sol çubuktaki rozet, açık pencere) günceller. Başarısızsa false döner.
// sadeceBos: toplu düğmeler için; sunucu mevcut kayıtların üstüne yazmaz.
async function yoklamayiKaydet(kayitlar, hataYeri, sadeceBos = false) {
    try {
        await istekGonder("PUT", "/api/yoklama", { kayitlar, sadece_bos: sadeceBos });
    } catch (hata) {
        mesajGoster(hataYeri, hata.message);
        return false;
    }
    mesajGoster(hataYeri, "");
    for (const kayit of kayitlar) {
        const mevcut = yoklamaVerisi.kayitlar.find((k) => (
            k.oturum_id === kayit.oturum_id && k.tarih === kayit.tarih && k.dilim === kayit.dilim));
        if (mevcut && sadeceBos) continue;
        if (mevcut) mevcut.durum = kayit.durum;
        else yoklamaVerisi.kayitlar.push({ ...kayit });
        yoklamaKayitlari.set(`${kayit.oturum_id}|${kayit.tarih}|${kayit.dilim}`, kayit.durum);
    }
    takvimiCiz();
    if (seciliDers()) devamsizligiCiz(seciliDers());
    yoklamaDurumunuGuncelle();
    return true;
}

// Verilen oturum-tarih satırlarının KAYDI OLMAYAN dilimleri için kayıt listesi (toplu düğmeler).
function bosDilimKayitlari(satirlar, durum) {
    const kayitlar = [];
    for (const { oturum, tarih } of satirlar) {
        for (const dilim of oturumYoklamasi(oturum, tarih).dilimler) {
            if (!dilim.durum) kayitlar.push({ oturum_id: oturum.id, tarih, dilim: dilim.baslangic, durum });
        }
    }
    return kayitlar;
}

// ============================================================
// KAPSÜL, AÇILIŞ PENCERESİ ve DÖNEM UYARISI
// ============================================================

// Dersler ya da yoklama verisi yenilenince çağrılır: sol çubuktaki rozeti, üstteki dönem bilgisini ve
// karşılamayı günceller; sayfa açılışında bekleyen varsa pencereyi (bir kez) açar.
function yoklamaDurumunuGuncelle() {
    const bekleyenSayisi = bekleyenYoklamalar().length;
    kabukBilgisiniGuncelle(bekleyenSayisi);

    if (!acilistaGosterildi) {
        acilistaGosterildi = true;
        if (bekleyenSayisi > 0) yoklamaPenceresiniAc();
    }
}

// Sadece yoklama verisini yeniler; rozeti, karşılamayı ve dönem bilgisini günceller (sekmeye dönünce ve 5 dakikada bir).
// Pencereyi kendiliğinden açmaz, takvimi ve paneli yeniden çizmez.
async function bekleyenleriYenile() {
    try {
        // Özetin tamamı alınır; dersler değiştirilmez (o sırada panelde yazılıyor olabilir),
        // sadece zamana bağlı veriler (şimdi, dönem, yoklama) tazelenir.
        yoklamaVerisiniAl(await istekGonder("GET", "/api/ozet"));
    } catch {
        return;   // sunucu kapalıysa sessizce geç; bir sonraki denemede düzelir
    }
    kabukBilgisiniGuncelle(bekleyenYoklamalar().length);
    genelBakisiCiz();   // kartlar ve bildirimler de yeni zamana göre güncellenir
}

// ============================================================
// YOKLAMA PENCERESİ
// ============================================================

// "2026-10-05" -> "Pazartesi, 5 Ekim"
function gunBasligi(tarih) {
    const [, ay, gun] = tarih.split("-").map(Number);
    return `${GUN_ADLARI[haftaninGunu(tarih)]}, ${gun} ${AY_ADLARI[ay - 1]}`;
}

// Pencereyi açar. Bekleyen yoksa da açılır ve "Bekleyen yoklama yok" yazar (sol çubuktan açılınca).
function yoklamaPenceresiniAc() {
    pencereListesi = bekleyenYoklamalar();
    mesajGoster(yoklamaHatasi, "");
    yoklamaPenceresiniCiz();
    pencereyiAc(yoklamaPenceresi);
}

// Dört durumlu seçici: basınca verilen dilimlerin HEPSİNE o durumu yazar.
//   dilimler : oturumun bütün dilimleri (oturum seviyesi) ya da tek dilim ("Saat saat" satırı)
//   secili   : vurgulanacak durum (yoksa null)
//   yazim    : "ad" düğmede durumun adı (pencere), "simge" sadece simge (panel),
//              "kisa" simge + kısa ad (dar yerde yazı gizlenir, ipucu kalır)
function durumSecici(oturum, tarih, dilimler, secili, yazim, hataYeri) {
    const secici = eleman("div", `durum-secici${yazim === "ad" ? "" : " kucuk"}`);
    for (const durum of AYARLAR.yoklamaDurumlari) {
        const dugme = eleman("button", "", yazim === "ad" ? durum.ad : durum.simge);
        if (yazim === "kisa") dugme.appendChild(eleman("span", "kisa-ad", durum.kisa));
        dugme.type = "button";
        dugme.title = durum.ad;
        dugme.setAttribute("aria-label", durum.ad);
        dugme.setAttribute("aria-pressed", String(durum.anahtar === secili));
        dugme.classList.toggle("secili", durum.anahtar === secili);
        // Basınca hemen kaydedilir; yanlışsa başka bir duruma basarak değiştirilebilir.
        dugme.addEventListener("click", () => {
            yoklamayiKaydet(dilimler.map((dilim) => (
                { oturum_id: oturum.id, tarih, dilim: dilim.baslangic, durum: durum.anahtar })), hataYeri)
                .then(pencereyiYenile);
        });
        secici.appendChild(dugme);
    }
    return secici;
}

// Bir oturum-tarih satırının yoklama parçaları (pencere ve "Geçmiş oturumlar" ortak kullanır):
//   secici : oturum seviyesinde 4 düğme; tüm dilimlere yazar, ancak dilimlerin hepsi aynıysa vurguludur
//   ok     : "Saat saat" bölümünü açıp kapatan düğme (tek saatlik oturumda yok)
//   bolum  : her dilim için saat aralığı ve küçük seçici (tek saatlik oturumda yok)
//   rozet, ozet : dilimler farklı işaretliyse "Karışık" rozeti ve "1. saat katıldı · 2. saat katılmadı"
function yoklamaParcalari(oturum, tarih, pencerede, hataYeri) {
    const yoklama = oturumYoklamasi(oturum, tarih);
    const parcalar = {
        secici: durumSecici(oturum, tarih, yoklama.dilimler, yoklama.ortak, pencerede ? "ad" : "simge", hataYeri),
    };
    if (yoklama.dilimler.length < 2) return parcalar;

    // Varsayılan kapalı; dilimler farklıysa ya da oturum yarım doldurulduysa kendiliğinden açık.
    // Kullanıcı elle açıp kapattıysa onun tercihi geçerlidir.
    const anahtar = `${oturum.id}|${tarih}`;
    const yarim = yoklama.eksik > 0 && yoklama.eksik < yoklama.dilimler.length;
    const acik = saatSaatTercihi.has(anahtar) ? saatSaatTercihi.get(anahtar) : (yoklama.karisik || yarim);

    const bolum = eleman("div", "saat-saat");
    bolum.hidden = !acik;
    for (const dilim of yoklama.dilimler) {
        const satir = eleman("div", "dilim-satiri");
        satir.append(eleman("span", "dilim-saati", `${dilim.baslangic} – ${dilim.bitis}`),
            durumSecici(oturum, tarih, [dilim], dilim.durum, pencerede ? "kisa" : "simge", hataYeri));
        bolum.appendChild(satir);
    }

    const ok = eleman("button", "saat-saat-dugmesi");
    ok.type = "button";
    ok.title = "Saat saat işaretle";
    ok.setAttribute("aria-label", "Saat saat işaretle");
    ok.setAttribute("aria-expanded", String(acik));
    if (pencerede) ok.appendChild(eleman("span", "", "Saat saat"));
    ok.appendChild(eleman("span", "ok"));   // ok işareti CSS ile çizilir
    ok.addEventListener("click", () => {
        bolum.hidden = !bolum.hidden;
        saatSaatTercihi.set(anahtar, !bolum.hidden);
        ok.setAttribute("aria-expanded", String(!bolum.hidden));
    });

    Object.assign(parcalar, { ok, bolum });
    if (yoklama.karisik) {
        parcalar.rozet = eleman("span", "hap uyari", "Karışık");
        parcalar.ozet = eleman("small", "dilim-ozeti", dilimOzeti(yoklama, false));
    }
    return parcalar;
}

// Listedeki oturumlardan hâlâ bekleyenlerin (en az bir saati girilmemiş) sayısı.
function penceredeKalan() {
    return pencereListesi.filter((satir) => oturumYoklamasi(satir.oturum, satir.tarih).eksik > 0).length;
}

// Pencere açıksa yeniden çizer; listedeki her oturum doldurulduysa kendiliğinden kapatır.
function pencereyiYenile() {
    if (!yoklamaPenceresi.open) return;
    yoklamaPenceresiniCiz();
    if (penceredeKalan() === 0) yoklamaPenceresi.close();
}

function yoklamaPenceresiniCiz() {
    document.getElementById("yoklama-basligi").textContent = `Bekleyen yoklamalar (${penceredeKalan()})`;
    const bugun = yoklamaVerisi.simdi.slice(0, 10);

    // Liste boşsa toplu işlem düğmeleri yerine "Bekleyen yoklama yok" notu görünür.
    const bos = pencereListesi.length === 0;
    document.getElementById("yoklama-bos").hidden = !bos;
    document.getElementById("yoklama-tumu-katildi").hidden = bos;
    document.getElementById("yoklama-tumu-alinmadi").hidden = bos;

    const kaydirma = yoklamaListesi.scrollTop;
    yoklamaListesi.replaceChildren();
    // Tarihe göre gruplar (liste zaten en yeni gün üstte sıralı).
    for (const tarih of [...new Set(pencereListesi.map((satir) => satir.tarih))]) {
        const gununSatirlari = pencereListesi.filter((satir) => satir.tarih === tarih);
        const grup = eleman("section", "yoklama-grubu");
        const baslik = eleman("h3", "", gunBasligi(tarih) + (tarih === bugun ? " · Bugün" : ""));
        // O günün girilmemiş saatlerini "katıldım" yapar; girilmiş olanlara dokunmaz.
        const hepsi = eleman("button", "baglanti", "Hepsi katıldım");
        hepsi.type = "button";
        hepsi.addEventListener("click", () => {
            const kayitlar = bosDilimKayitlari(gununSatirlari, "katildi");
            if (kayitlar.length > 0) yoklamayiKaydet(kayitlar, yoklamaHatasi, true).then(pencereyiYenile);
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
            const parcalar = yoklamaParcalari(oturum, tarih, true, yoklamaHatasi);
            if (parcalar.rozet) bilgi.append(" ", parcalar.rozet, parcalar.ozet);
            satir.append(nokta, bilgi, parcalar.secici);
            if (parcalar.ok) satir.append(parcalar.ok, parcalar.bolum);
            grup.appendChild(satir);
        }
        yoklamaListesi.appendChild(grup);
    }
    yoklamaListesi.scrollTop = kaydirma;
}

// Penceredeki oturumların girilmemiş bütün saatlerini verilen duruma getirir (onay ister).
// Girilmiş kayıtların üstüne yazmaz.
function tumunuIsaretle(durum) {
    const kayitlar = bosDilimKayitlari(pencereListesi, durum);
    if (kayitlar.length === 0) return;
    const onay = confirm(`${kayitlar.length} saatlik kayıt yazılacak: girilmemiş saatlerin hepsi `
        + `“${durumBul(durum).ad}” olacak, girilmiş kayıtlar değişmeyecek. Devam edilsin mi?`);
    if (!onay) return;
    yoklamayiKaydet(kayitlar, yoklamaHatasi, true).then(pencereyiYenile);
}

// ============================================================
// TAKVİMDE GÖSTERİM
// ============================================================

// Ders bloğunun sol üst köşesine o günün yoklama durumunu gösteren küçük simgeyi ekler.
//   bütün saatler aynı durumda          : o durumun simgesi (hepsi iptalse blok yarı saydam)
//   ders bitmiş, girilmemiş saat var    : sarı "?"
//   saatler farklı işaretli             : "◐", ipucunda saat saat durum
//   hiç kayıt yok ve ders bitmemiş      : simge yok
// (Simge çekirdek alanın sol üstünde durur: sağ üstteki "⋯" butonuyla çakışmaz, yazıyı kaydırmaz.)
function yoklamaSimgesiEkle(blok, cekirdek, oturum, tarih) {
    if (!oturumPlanliMi(oturum, tarih)) return;
    const yoklama = oturumYoklamasi(oturum, tarih);
    const cokDilimli = yoklama.dilimler.length > 1;
    let simge;
    if (yoklama.ortak) {
        const durum = durumBul(yoklama.ortak);
        simge = eleman("span", "yoklama-simgesi", durum.simge);
        simge.title = `Yoklama: ${durum.ad}`;
        if (durum.anahtar === "iptal") blok.classList.add("iptal");
    } else if (dersBittiMi(oturum, tarih) && yoklama.eksik > 0) {
        simge = eleman("span", "yoklama-simgesi bekliyor", "?");
        // Yarım doldurulmuşsa hangi saatin eksik olduğu ipucunda yazar.
        simge.title = yoklama.eksik < yoklama.dilimler.length
            ? `Yoklama eksik: ${dilimOzeti(yoklama, true)}` : "Yoklama girilmedi";
    } else if (cokDilimli && yoklama.eksik < yoklama.dilimler.length) {
        simge = eleman("span", "yoklama-simgesi", AYARLAR.karisikSimgesi);
        simge.title = `Yoklama: ${dilimOzeti(yoklama, true)}`;
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

// Bir havuzun (Teori / Lab / Toplam) kartı: "Dönem ilerlemesi" kartının düzeninde.
//   Başlık : havuz adı, sağda durum rozeti (✓ Güvende / ! Dikkat / ✗ Hak bitti / ✗ Sınır aşıldı)
//   Halka  : kullanılan devamsızlık / sınır (sınır girilmemişse katılım yüzdesi). Ortasındaki değere
//            basınca "katılım %83" ile "10s / 2s" (gidilen / gidilmeyen saat) arasında değişir.
//   Satırlar: Gidilen, Gidilmeyen, Kalan hak, Kalan ders, Sınır
// Hesap ve renk eşikleri dersYoklamasi'ndan gelir; burada sadece gösterilir.
function havuzKarti(havuz) {
    const birim = birimAdi();
    const sayi = (deger) => ikiOndalik(deger);
    const sinirVar = havuz.limit !== null;

    let rozet = null;
    if (havuz.renk === "yesil") rozet = durumRozeti("olumlu", "✓", "Güvende");
    else if (havuz.renk === "sari") rozet = durumRozeti("uyari", "!", "Dikkat");
    else if (havuz.renk === "kirmizi") rozet = durumRozeti("tehlike", "✗", havuz.kalanHak < 0 ? "Sınır aşıldı" : "Hak bitti");
    const { kart, govde } = ozetKarti({ baslik: havuz.ad, simge: "katilim", kare: "ton", ton: "turkuaz", rozet });

    // Halkanın doluluğu ve rengi.
    let doluluk;
    let etiket;
    if (sinirVar) {
        doluluk = havuz.limit > 0 ? Math.min(1, havuz.gidilmeyen / havuz.limit) : 1;
        etiket = `Kullanılan ${sayi(havuz.gidilmeyen)} / ${sayi(havuz.limit)} ${birim}`;
    } else {
        doluluk = havuz.katilimYuzdesi === null ? 0 : havuz.katilimYuzdesi / 100;
        etiket = havuz.katilimYuzdesi === null ? "Henüz veri yok" : `Katılım yüzde ${Math.round(havuz.katilimYuzdesi * 10) / 10}`;
    }
    const halkaRengi = { yesil: "olumlu", sari: "uyari", kirmizi: "tehlike" }[havuz.renk] || "";
    const saatGorunumu = saatGorunumuMu();
    const veriVar = havuz.katilimYuzdesi !== null;
    const halka = panelHalkasi({
        doluluk, etiket, renk: halkaRengi,
        buyuk: !veriVar ? "—" : saatGorunumu
            ? `${sayi(havuz.gidilen)}s / ${sayi(havuz.gidilmeyen)}s`
            : `%${Math.round(havuz.katilimYuzdesi * 10) / 10}`,
        kucuk: !veriVar ? "veri yok" : saatGorunumu ? "saat" : "katılım",
    });
    halka.title = etiket;
    if (veriVar) {
        // Ortadaki yazı bir düğmedir: yüzde <-> saat (tercih tarayıcıda saklanır).
        const orta = halka.querySelector("strong");
        const dugme = eleman("button", `halka-dugmesi ${orta.className}${saatGorunumu ? " dar-yazi" : ""}`);
        dugme.type = "button";
        dugme.append(...orta.childNodes);
        dugme.title = saatGorunumu ? "Yüzde için dokun" : "Saat için dokun";
        dugme.setAttribute("aria-pressed", String(saatGorunumu));
        dugme.setAttribute("aria-label", saatGorunumu
            ? `Gidilen ${sayi(havuz.gidilen)} ${birim}, gidilmeyen ${sayi(havuz.gidilmeyen)} ${birim}. Yüzde için dokun`
            : `Katılım yüzde ${Math.round(havuz.katilimYuzdesi * 10) / 10}. Saat için dokun`);
        dugme.addEventListener("click", gorunumuDegistir);
        orta.replaceWith(dugme);
    }

    govde.appendChild(halkaDuzeni(halka, [
        ["Gidilen", `${sayi(havuz.gidilen)} ${birim}`],
        ["Gidilmeyen", `${sayi(havuz.gidilmeyen)} ${birim}`],
        ["Kalan hak", sinirVar ? `${sayi(havuz.kalanHak)} ${birim}` : "—",
            havuz.renk === "kirmizi" ? "tehlike" : havuz.renk === "sari" ? "uyari" : ""],
        ["Kalan ders", `${sayi(havuz.kalanDers)} ${birim}`],
        ["Sınır", sinirVar ? `%${havuz.yuzde} · ${sayi(havuz.limit)} ${birim}` : "Girilmemiş"],
    ]));

    // Küçük soluk satır: dönem toplamı ve (varsa) alınmayan / iptal saatler.
    const digerleri = [`Dönem toplamı ${sayi(havuz.toplam)} ${birim} (iptal ve tatiller hariç)`, `Geçen ${sayi(havuz.gecen)}`];
    if (havuz.alinmadi > 0) digerleri.push(`Yoklama alınmadı ${sayi(havuz.alinmadi)}`);
    if (havuz.iptal > 0) digerleri.push(`İptal ${sayi(havuz.iptal)}`);
    govde.appendChild(eleman("p", "kucuk-not", digerleri.join(" · ")));

    // Uyarı ve aşım mesajları (iç satır).
    if (!sinirVar) govde.appendChild(mesajSatiri({ ton: "bilgi", simge: "i", baslik: "Devamsızlık hakkı girilmemiş." }));
    else if (havuz.kalanHak < 0) govde.appendChild(mesajSatiri({ ton: "tehlike", simge: "✗", baslik: "Devamsızlık sınırı aşıldı." }));
    else if (havuz.kalanHak === 0) govde.appendChild(mesajSatiri({ ton: "tehlike", simge: "✗", baslik: "Hakkın bitti, bir sonraki devamsızlıkta sınırı aşarsın." }));
    else if (havuz.renk === "sari") govde.appendChild(mesajSatiri({ ton: "uyari", simge: "!", baslik: "Devamsızlık sınırına yaklaştın." }));
    return kart;
}

// Sekmenin tamamını tek kutuda çizer: (varsa) dönem notu, havuz bölümleri ve "Geçmiş oturumlar".
function devamsizligiCiz(ders) {
    const kaydirma = devamsizlikIcerigi.scrollTop;
    const kutu = sekmeKarti("turkuaz");
    devamsizlikIcerigi.replaceChildren(kutu);
    const donem = yoklamaVerisi.donem;
    if (!donem) {
        // Dönem girilmemiş: aynı kart stilinde boş durum.
        const { kart, govde } = ozetKarti({ baslik: "Devamsızlık", simge: "katilim", kare: "ton", ton: "turkuaz" });
        const satir = mesajSatiri({ ton: "uyari", simge: "!", baslik: "Yoklama takibi için dönem tarihlerini gir." });
        satir.querySelector(".ic-satir-yazisi").appendChild(donemBaglantisi("Akademik takvimi aç"));
        govde.appendChild(satir);
        kutu.appendChild(kart);
        return;
    }
    if (yoklamaVerisi.simdi.slice(0, 10) < donem.baslangic) {
        kutu.appendChild(eleman("p", "kucuk-not", `Dönem ${tarihiGoster(donem.baslangic)} tarihinde başlıyor.`));
    }
    for (const havuz of dersYoklamasi(ders)) kutu.appendChild(havuzKarti(havuz));

    // Geçmiş oturumlar: dersi bitmiş planlanan oturumlar, en yeni üstte. Buradan değiştirilebilir;
    // 2+ saatlik oturum ok düğmesiyle genişler ve saat saat işaretlenebilir.
    const gecmis = [];
    for (const oturum of ders.oturumlar) {
        for (const tarih of planlananTarihler(oturum)) {
            if (dersBittiMi(oturum, tarih)) gecmis.push({ oturum, tarih });
        }
    }
    gecmis.sort((a, b) => b.tarih.localeCompare(a.tarih) || b.oturum.baslangic.localeCompare(a.oturum.baslangic));
    if (gecmis.length > 0) {
        const { kart, govde } = ozetKarti({
            baslik: "Geçmiş oturumlar", simge: "gecmis", kare: "ton", ton: "turkuaz",
            rozet: hapRozet(`${gecmis.length} oturum`),
        });
        kart.classList.add("gecmis-oturumlar");
        const hataYeri = eleman("p", "mesaj hata");
        hataYeri.hidden = true;
        for (const { oturum, tarih } of gecmis.slice(0, gecmisSatirSayisi)) {
            const satir = eleman("div", "ic-satir gecmis-satiri");
            const bilgi = eleman("div", "ic-satir-yazisi");
            bilgi.appendChild(eleman("strong", "", tarihiGoster(tarih)));
            bilgi.appendChild(eleman("small", "", [`${oturum.baslangic} – ${oturum.bitis}`, oturum.tur].filter(Boolean).join(" · ")));
            const parcalar = yoklamaParcalari(oturum, tarih, false, hataYeri);
            if (parcalar.rozet) bilgi.append(parcalar.rozet, parcalar.ozet);
            satir.append(bilgi, parcalar.secici);
            if (parcalar.ok) satir.append(parcalar.ok, parcalar.bolum);
            govde.appendChild(satir);
        }
        govde.appendChild(hataYeri);
        if (gecmis.length > gecmisSatirSayisi) {
            const dahaFazla = eleman("button", "satir-ekle", "Daha fazla göster");
            dahaFazla.type = "button";
            dahaFazla.addEventListener("click", () => {
                gecmisSatirSayisi += 15;
                devamsizligiCiz(ders);
            });
            govde.appendChild(dahaFazla);
        }
        kutu.appendChild(kart);
    }
    devamsizlikIcerigi.scrollTop = kaydirma;
}

// ============================================================
// OLAYLAR
// ============================================================

document.getElementById("yoklama-kapat").addEventListener("click", () => yoklamaPenceresi.close());
document.getElementById("yoklama-sonra").addEventListener("click", () => yoklamaPenceresi.close());
document.getElementById("yoklama-tumu-katildi").addEventListener("click", () => tumunuIsaretle("katildi"));
document.getElementById("yoklama-tumu-alinmadi").addEventListener("click", () => tumunuIsaretle("alinmadi"));

// "Akademik takvimi aç" bağlantısı (Devamsızlık sekmesi):
// Dönem ekranı "Akademik takvim" sekmesinde açılır.
document.getElementById("yan-panel").addEventListener("click", (olay) => {
    if (olay.target.closest("[data-donem-ac]")) donemEkraniniAc();
});

// Sekmeye geri dönülünce ve 5 dakikada bir bekleyenler yeniden hesaplanır (takvim ve panel yeniden çizilmez).
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") bekleyenleriYenile();
});
setInterval(bekleyenleriYenile, 5 * 60 * 1000);
