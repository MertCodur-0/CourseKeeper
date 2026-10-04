// Hava durumu kartı (Genel bakış) ve Ayarlar > Konum'daki şehir seçimi.
//
// Veri Open-Meteo'dan SUNUCU üzerinden gelir (/api/hava, /api/sehir-ara); tarayıcı dışarıya
// istek atmaz ve konum izni istenmez. Şehir kullanıcının Ayarlar'da seçtiği yerdir; tarayıcıda
// küçük bir arayüz tercihi olarak saklanır. Varsayılan şehir yoktur.
// En son yüklenir: genel.js'teki kart yardımcılarını ve kabuk.js'teki tercihOku / tercihYaz'ı kullanır.

const SEHIR_TERCIHI = "derstakip.sehir";   // {ad, enlem, boylam}
const HAVA_YENILEME = 30 * 60 * 1000;      // 30 dakika

// Kartın o anki durumu. asama: "bos" (henüz istenmedi), "yukleniyor", "hazir", "hata"
let havaDurumu = { asama: "bos", veri: null, hata: "", zaman: 0 };

// Hava simgeleri (satır içi SVG yolları). "acik" ve "az-bulutlu"nun gece hali ayrıdır.
const HAVA_SIMGELERI = {
    acik: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
    "acik-gece": '<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z"/>',
    "az-bulutlu": '<circle cx="8.5" cy="8.5" r="2.8"/><path d="M8.5 3v1.3M3 8.5h1.3M4.6 4.6l.9.9M12.4 4.6l-.9.9"/><path d="M8.8 19.5h8a3.2 3.2 0 0 0 .4-6.4 4.6 4.6 0 0 0-8.7 1.3 2.6 2.6 0 0 0 .3 5.1z"/>',
    "az-bulutlu-gece": '<path d="M11.2 6.2A4.2 4.2 0 0 1 6.2 11a4.2 4.2 0 0 0 .8.9"/><path d="M11.2 6.2a4.2 4.2 0 1 0-5 4.8"/><path d="M8.8 19.5h8a3.2 3.2 0 0 0 .4-6.4 4.6 4.6 0 0 0-8.7 1.3 2.6 2.6 0 0 0 .3 5.1z"/>',
    bulut: '<path d="M7 18.5h10a4 4 0 0 0 .5-8 5.8 5.8 0 0 0-11-1.6A4.2 4.2 0 0 0 7 18.5z"/>',
    yagmur: '<path d="M7 15.5h10a4 4 0 0 0 .5-8 5.8 5.8 0 0 0-11-1.6A4.2 4.2 0 0 0 7 15.5z"/><path d="M8.5 18.5l-.8 2M12.5 18.5l-.8 2M16.5 18.5l-.8 2"/>',
    kar: '<path d="M7 15.5h10a4 4 0 0 0 .5-8 5.8 5.8 0 0 0-11-1.6A4.2 4.2 0 0 0 7 15.5z"/><path d="M8.5 19.2v.1M12 20.5v.1M15.5 19.2v.1"/>',
    firtina: '<path d="M7 15.5h10a4 4 0 0 0 .5-8 5.8 5.8 0 0 0-11-1.6A4.2 4.2 0 0 0 7 15.5z"/><path d="m12.5 15-2 3h3l-2 3"/>',
    sis: '<path d="M7 13.5h10a4 4 0 0 0 .5-8 5.8 5.8 0 0 0-11-1.6A4.2 4.2 0 0 0 7 13.5z"/><path d="M5 17h14M7.5 20.5h9"/>',
};

function havaSimgesi(ad, gunduz = true) {
    const geceAdi = `${ad}-gece`;
    const yollar = HAVA_SIMGELERI[!gunduz && HAVA_SIMGELERI[geceAdi] ? geceAdi : ad] || HAVA_SIMGELERI.bulut;
    const kap = document.createElement("span");
    kap.innerHTML = `<svg class="simge" viewBox="0 0 24 24" aria-hidden="true">${yollar}</svg>`;
    return kap.firstElementChild;
}

// ============================================================
// ŞEHİR (Ayarlar > Konum)
// ============================================================

// Seçili şehir: {ad, enlem, boylam} ya da null (seçilmemiş ya da kayıt bozuk).
function seciliSehir() {
    try {
        const sehir = JSON.parse(tercihOku(SEHIR_TERCIHI) || "null");
        if (sehir && typeof sehir.ad === "string" && Number.isFinite(sehir.enlem) && Number.isFinite(sehir.boylam)) return sehir;
    } catch {
        // bozuk kayıt: şehir seçilmemiş sayılır
    }
    return null;
}

const sehirKutusu = document.getElementById("sehir-kutusu");
const sehirSonuclari = document.getElementById("sehir-sonuclari");
const sehirDurumu = document.getElementById("sehir-durumu");
const sehriKaldirDugmesi = document.getElementById("sehri-kaldir");
let sehirZamanlayici = null;   // yazarken 250 ms bekleyip arar
let sehirAramaNo = 0;          // geç gelen eski yanıtlar yok sayılır

// Ayarlar'daki "Konum" bölümünü seçili şehre göre yazar.
function konumBolumunuCiz() {
    const sehir = seciliSehir();
    document.getElementById("secili-sehir").textContent = sehir ? `Seçili şehir: ${sehir.ad}` : "Şehir seçilmedi.";
    sehriKaldirDugmesi.hidden = !sehir;
    sehirSonuclari.replaceChildren();
    sehirDurumu.textContent = "";
}

function sehriSec(sehir) {
    tercihYaz(SEHIR_TERCIHI, JSON.stringify({ ad: sehir.ad, enlem: sehir.enlem, boylam: sehir.boylam }));
    sehirKutusu.value = "";
    konumBolumunuCiz();
    havaDurumu = { asama: "bos", veri: null, hata: "", zaman: 0 };   // eski şehrin verisi gösterilmesin
    havayiYukle();
}

function sehriKaldir() {
    try {
        localStorage.removeItem(SEHIR_TERCIHI);
    } catch {
        // saklama alanına ulaşılamadı
    }
    havaDurumu = { asama: "bos", veri: null, hata: "", zaman: 0 };
    konumBolumunuCiz();
    genelBakisiCiz();
}

async function sehirAra() {
    const aranan = sehirKutusu.value.trim();
    sehirSonuclari.replaceChildren();
    if (aranan.length < 2) {   // en az 2 karakter
        sehirDurumu.textContent = "";
        return;
    }
    const buArama = ++sehirAramaNo;
    sehirDurumu.textContent = "Aranıyor...";
    let sehirler;
    try {
        sehirler = (await istekGonder("GET", `/api/sehir-ara?q=${encodeURIComponent(aranan)}`)).sehirler;
    } catch (hata) {
        if (buArama === sehirAramaNo) sehirDurumu.textContent = hata.message;
        return;
    }
    if (buArama !== sehirAramaNo) return;
    sehirDurumu.textContent = sehirler.length === 0 ? "Sonuç bulunamadı." : "";
    for (const sehir of sehirler) {
        // Satır: şehir, bölge, ülke. Tıklayınca (ya da Enter/Boşluk ile) seçilir.
        const aciklama = [sehir.bolge, sehir.ulke].filter((parca) => parca && parca !== sehir.ad).join(", ");
        sehirSonuclari.appendChild(icSatir({ baslik: sehir.ad, aciklama, eylem: () => sehriSec(sehir) }));
    }
}

sehirKutusu.addEventListener("input", () => {
    clearTimeout(sehirZamanlayici);
    sehirZamanlayici = setTimeout(sehirAra, 250);
});
sehriKaldirDugmesi.addEventListener("click", sehriKaldir);

// ============================================================
// VERİYİ YÜKLEME
// ============================================================

// Seçili şehrin havasını sunucudan ister ve kartı yeniden çizdirir. Şehir yoksa bir şey yapmaz.
// İstek başarısız olursa elde daha önce gelmiş veri varsa o gösterilmeye devam eder (çevrimdışı notuyla).
async function havayiYukle() {
    const sehir = seciliSehir();
    if (!sehir) {
        genelBakisiCiz();
        return;
    }
    const oncekiVeri = havaDurumu.veri;
    if (!oncekiVeri) {
        havaDurumu = { asama: "yukleniyor", veri: null, hata: "", zaman: havaDurumu.zaman };
        genelBakisiCiz();   // iskelet görünsün
    }
    try {
        const veri = await istekGonder("GET", `/api/hava?lat=${sehir.enlem}&lon=${sehir.boylam}`);
        havaDurumu = { asama: "hazir", veri, hata: "", zaman: Date.now() };
    } catch (hata) {
        havaDurumu = oncekiVeri
            ? { asama: "hazir", veri: { ...oncekiVeri, cevrimdisi: true }, hata: "", zaman: Date.now() }
            : { asama: "hata", veri: null, hata: hata.message, zaman: Date.now() };
    }
    genelBakisiCiz();
}

// Veri 30 dakikadan eskiyse (ve kart görünürken) yeniler.
function havayiGerekirseYenile() {
    if (!seciliSehir() || genelBakis.hidden) return;
    if (Date.now() - havaDurumu.zaman >= HAVA_YENILEME) havayiYukle();
}

setInterval(havayiGerekirseYenile, HAVA_YENILEME);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") havayiGerekirseYenile();
});

// ============================================================
// KART
// ============================================================

// "18°"
function derece(sayi) {
    return `${Math.round(sayi)}°`;
}

// Tahmin şeridindeki gün adı: yarın için "Yarın", sonrası kısa gün adı (Pzt, Sal ...).
function tahminGunu(tarih, sira) {
    return sira === 1 ? "Yarın" : AYARLAR.gunler[haftaninGunu(tarih)];
}

function havaKarti() {
    const sehir = seciliSehir();
    const veri = havaDurumu.veri;
    const simgeAdi = veri ? veri.simdi.simge : "az-bulutlu";
    const gunduz = veri ? veri.simdi.gunduz : true;

    // Sağ üstte rozet: bugünkü yağış ihtimali %50 ve üstüyse.
    const yagisli = veri && veri.gunler[0] && veri.gunler[0].yagis >= 50;
    const { kart, govde } = ozetKarti({
        baslik: "Hava durumu", simge: "halka", kare: "gok", ton: "gok",
        rozet: yagisli ? hapRozet("Şemsiye al", "gok") : null,
    });
    // Simge karesindeki simge hava durumuna göre; başlığın altında soluk küçük şehir adı.
    kart.querySelector(".simge-karesi").replaceChildren(havaSimgesi(simgeAdi, gunduz));
    if (sehir) {
        const baslik = kart.querySelector("h3");
        baslik.appendChild(eleman("small", "", sehir.ad));
    }

    // 1) Şehir seçilmemiş.
    if (!sehir) {
        govde.appendChild(icSatir({
            baslik: "Şehir seç", aciklama: "Hava durumunu görmek için Ayarlar > Konum'dan şehrini seç",
            eylem: () => cubukOgesineBasildi("konum"),
        }));
        return kart;
    }
    // 2) İlk yükleme: iskelet.
    if (!veri && havaDurumu.asama !== "hata") {
        const iskelet = eleman("div", "hava-iskeleti");
        iskelet.setAttribute("aria-label", "Hava durumu yükleniyor");
        iskelet.append(eleman("span", "iskelet buyuk"), eleman("span", "iskelet"), eleman("span", "iskelet"));
        govde.appendChild(iskelet);
        return kart;
    }
    // 3) Hiç veri yok ve istek başarısız.
    if (!veri) {
        govde.appendChild(eleman("div", "ic-satir bos", "Hava durumu için internet gerekli"));
        const dugme = eleman("button", "dugme", "Yeniden dene");
        dugme.type = "button";
        dugme.addEventListener("click", havayiYukle);
        govde.appendChild(dugme);
        return kart;
    }

    // 4) Veri var: büyük sıcaklık + durum, 2×2 kutucuk, 3 günlük şerit.
    const ust = eleman("div", "hava-ust");
    ust.append(eleman("strong", "", derece(veri.simdi.sicaklik)), eleman("span", "", veri.simdi.durum));
    govde.appendChild(ust);

    const bugun = veri.gunler[0];
    const kutular = eleman("div", "hava-kutulari");
    for (const [etiket, deger] of [
        ["Hissedilen", derece(veri.simdi.hissedilen)],
        ["Bugün", bugun ? `${derece(bugun.en_dusuk)} / ${derece(bugun.en_yuksek)}` : "—"],
        ["Yağış", bugun && bugun.yagis != null ? `%${Math.round(bugun.yagis)}` : "—"],
        ["Rüzgar", `${Math.round(veri.simdi.ruzgar)} km/sa`],
    ]) {
        const kutu = eleman("div", "hava-kutusu");
        kutu.append(eleman("span", "", etiket), eleman("strong", "", deger));
        kutular.appendChild(kutu);
    }
    govde.appendChild(kutular);

    const serit = eleman("div", "hava-seridi");
    veri.gunler.slice(1, 4).forEach((gun, sira) => {
        const hucre = eleman("div", "hava-gunu");
        hucre.title = gun.durum;
        hucre.append(
            eleman("span", "", tahminGunu(gun.tarih, sira + 1)),
            havaSimgesi(gun.simge),
            eleman("small", "", `${derece(gun.en_yuksek)} / ${derece(gun.en_dusuk)}`),
        );
        serit.appendChild(hucre);
    });
    govde.appendChild(serit);

    // En altta: (varsa) çevrimdışı notu ve kaynak.
    const altNot = veri.cevrimdisi ? `Çevrimdışı · son güncelleme ${veri.guncelleme} · Open-Meteo.com` : "Open-Meteo.com";
    govde.appendChild(eleman("p", "hava-kaynagi", altNot));
    return kart;
}

// Sayfa açılışında şehir seçiliyse hava durumu istenir.
if (seciliSehir()) havayiYukle();
