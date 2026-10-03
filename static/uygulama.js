// DersTakip'in tarayıcı tarafı: dersleri sunucudan alır, takvime blok olarak
// çizer ve ders ekleme/düzenleme formunu yönetir.

// ============================================================
// DURUM
// ============================================================

let dersler = [];               // sunucudan gelen bütün dersler
let siradakiRenk = null;        // yeni derse önerilecek (kullanılmayan ilk) renk
let duzenlenenDersId = null;    // formda açık olan dersin kimliği (yeni derste null)

const SAAT_KALIBI = /^([01]\d|2[0-3]):[0-5]\d$/;   // "09:30" gibi

// Sayfadaki parçalar
const takvim = document.getElementById("takvim");
const izgara = document.getElementById("izgara");
const pencere = document.getElementById("ders-penceresi");
const pencereBasligi = document.getElementById("pencere-basligi");
const secimEkrani = document.getElementById("secim-ekrani");
const form = document.getElementById("ders-formu");
const oturumListesi = document.getElementById("oturum-listesi");
const degerlendirmeListesi = document.getElementById("degerlendirme-listesi");
const degerlendirmeBolumu = document.getElementById("degerlendirme-bolumu");
const oturumHatasi = document.getElementById("oturum-hatasi");
const oturumUyarisi = document.getElementById("oturum-uyarisi");
const agirlikToplami = document.getElementById("agirlik-toplami");
const kayitHatasi = document.getElementById("kayit-hatasi");
const kaydetDugmesi = document.getElementById("kaydet-dugmesi");
const silDugmesi = document.getElementById("sil-dugmesi");

// ============================================================
// KÜÇÜK YARDIMCILAR
// ============================================================

// "09:30" -> 9.5 (saat cinsinden sayı)
function saatiSayiyaCevir(saat) {
    const [saatKismi, dakikaKismi] = saat.split(":").map(Number);
    return saatKismi + dakikaKismi / 60;
}

// 9 -> "09:00"
function saatYazisi(saat) {
    return String(saat).padStart(2, "0") + ":00";
}

// Kullanıcının yazdığı saati tamamlar: "9" -> "09:00", "9:30" -> "09:30"
function saatiDuzelt(yazi) {
    yazi = yazi.trim().replace(".", ":");
    if (/^\d{1,2}$/.test(yazi)) yazi += ":00";
    if (/^\d:\d\d$/.test(yazi)) yazi = "0" + yazi;
    return yazi;
}

function mesajGoster(eleman, yazi) {
    eleman.textContent = yazi;
    eleman.hidden = yazi === "";
}

// Sunucuya JSON isteği gönderir, cevabı döndürür. Hata olursa mesajıyla birlikte fırlatır.
async function istekGonder(yontem, adres, veri) {
    const yanit = await fetch(adres, {
        method: yontem,
        headers: { "Content-Type": "application/json" },
        body: veri ? JSON.stringify(veri) : undefined,
    });
    const sonuc = await yanit.json();
    if (!yanit.ok) throw new Error(sonuc.hata || "Bir hata oluştu.");
    return sonuc;
}

// ============================================================
// TAKVİM: ders bloklarını çizme
// ============================================================

async function dersleriYukle() {
    const sonuc = await istekGonder("GET", "/api/dersler");
    dersler = sonuc.dersler;
    siradakiRenk = sonuc.siradaki_renk;
    takvimiCiz();
}

// Aynı gündeki oturumlara yan yana sütun atar ki çakışanlar üst üste binmesin.
// Her oturuma "sutun" (kaçıncı sırada) ve "sutunSayisi" (kaça bölündüğü) yazılır.
function cakismalariYerlestir(oturumlar) {
    const sirali = [...oturumlar].sort((a, b) => a.bas - b.bas || a.bit - b.bit);
    let kume = [];              // birbirine zincirleme değen oturumlar
    let kumeBitisi = -Infinity; // kümedeki en geç bitiş saati
    let sutunBitisleri = [];    // her yan sütundaki son oturumun bitiş saati

    function kumeyiKapat() {
        for (const oturum of kume) oturum.sutunSayisi = sutunBitisleri.length;
        kume = [];
        sutunBitisleri = [];
        kumeBitisi = -Infinity;
    }

    for (const oturum of sirali) {
        // Bu oturum öncekilerin hepsi bittikten sonra başlıyorsa yeni küme başlar.
        if (oturum.bas >= kumeBitisi) kumeyiKapat();
        // Boşalmış ilk yan sütuna yerleş, yoksa yeni sütun aç.
        let sutun = sutunBitisleri.findIndex((bitis) => bitis <= oturum.bas);
        if (sutun === -1) sutun = sutunBitisleri.length;
        sutunBitisleri[sutun] = oturum.bit;
        oturum.sutun = sutun;
        kume.push(oturum);
        kumeBitisi = Math.max(kumeBitisi, oturum.bit);
    }
    kumeyiKapat();
    return sirali;
}

// Tek bir oturumun takvimdeki bloğunu oluşturur.
// Konum ve yükseklik stil.css'te, buradaki dört değerden hesaplanır.
// Yapı: blok (ızgaradaki tam yer) > kutu (renkli, yuvarlak köşeli) > içerik (yazılar)
function blokOlustur(yerlesim) {
    const renk = AYARLAR.renkler.find((r) => r.anahtar === yerlesim.ders.renk) || AYARLAR.renkler[0];

    const blok = document.createElement("button");
    blok.type = "button";
    blok.className = "ders-blogu";
    // Tıklama noktası: blok, ait olduğu dersin kimliğini taşır.
    blok.dataset.dersId = yerlesim.ders.id;
    blok.style.setProperty("--baslangic", yerlesim.bas);            // ör. 9.5
    blok.style.setProperty("--sure", yerlesim.bit - yerlesim.bas);  // ör. 1.5
    blok.style.setProperty("--sutun", yerlesim.sutun);
    blok.style.setProperty("--sutun-sayisi", yerlesim.sutunSayisi);
    // Yazı sığmayıp kesilirse bilgiler üzerine gelince buradan okunur.
    blok.title = `${yerlesim.ders.kod} · ${yerlesim.oturum.derslik} · ${yerlesim.oturum.baslangic}-${yerlesim.oturum.bitis}`;

    const kutu = document.createElement("span");
    kutu.className = "blok-kutu";
    kutu.style.background = renk.kod;
    kutu.style.color = renk.yazi;

    const icerik = document.createElement("span");
    icerik.className = "blok-icerik";

    // "CMPE 114_01" ilk boşluktan ikiye bölünür: üstte "CMPE", altta "114_01".
    // Kodda boşluk yoksa tek satır olur.
    const kod = document.createElement("span");
    kod.className = "blok-kod";
    const bosluk = yerlesim.ders.kod.indexOf(" ");
    const kodSatirlari = bosluk === -1
        ? [yerlesim.ders.kod]
        : [yerlesim.ders.kod.slice(0, bosluk), yerlesim.ders.kod.slice(bosluk + 1).trim()];
    for (const satir of kodSatirlari) {
        const satirEl = document.createElement("span");
        satirEl.textContent = satir;
        kod.appendChild(satirEl);
    }

    const derslik = document.createElement("span");
    derslik.className = "blok-derslik";
    derslik.textContent = yerlesim.oturum.derslik;

    icerik.append(kod, derslik);
    kutu.appendChild(icerik);
    blok.appendChild(kutu);
    return blok;
}

// Yazı bloğa sığmıyorsa sırayla denenecek basamaklar: [kod ile derslik arası boşluk, yazı boyutu] (px).
// Önce aradaki boşluk daralır, sonra yazı küçülür. İlk basamak normal görünümdür.
const SIGDIRMA_BASAMAKLARI = [
    [12, 12.5], [8, 12.5], [4, 12.5], [2, 12.5],
    [2, 11.5], [2, 10.5], [1, 9.5], [1, 8.5], [0, 7.5],
];

// Bloğun yazısını kutusuna sığan ilk basamağa ayarlar.
// En küçük basamak da sığmazsa taşan kısım kutunun içinde kesilir (dışarı taşmaz).
function bloguSigdir(blok) {
    const kutu = blok.querySelector(".blok-kutu");
    const icerik = blok.querySelector(".blok-icerik");
    for (const [bosluk, punto] of SIGDIRMA_BASAMAKLARI) {
        blok.style.setProperty("--blok-bosluk", bosluk + "px");
        blok.style.setProperty("--blok-punto", punto + "px");
        // 4px: yazı kutunun kenarına yapışmasın diye bırakılan pay.
        const sigiyor = icerik.offsetHeight <= kutu.clientHeight - 4
            && icerik.offsetWidth <= kutu.clientWidth - 4;
        if (sigiyor) break;
    }
}

function bloklariSigdir() {
    document.querySelectorAll(".ders-blogu").forEach(bloguSigdir);
}

function takvimiCiz() {
    document.querySelectorAll(".ders-blogu").forEach((blok) => blok.remove());

    document.querySelectorAll(".gun-sutunu").forEach((gunSutunu) => {
        const gun = Number(gunSutunu.dataset.gun);
        const gununOturumlari = [];
        for (const ders of dersler) {
            for (const oturum of ders.oturumlar) {
                if (oturum.gun !== gun) continue;
                // Takvimin dışına taşan kısım kırpılır (09:00 öncesi, 21:00 sonrası).
                const bas = Math.max(saatiSayiyaCevir(oturum.baslangic), AYARLAR.ilkSaat);
                const bit = Math.min(saatiSayiyaCevir(oturum.bitis), AYARLAR.sonSaat);
                if (bit <= bas) continue;
                gununOturumlari.push({ ders, oturum, bas, bit });
            }
        }
        for (const yerlesim of cakismalariYerlestir(gununOturumlari)) {
            gunSutunu.appendChild(blokOlustur(yerlesim));
        }
    });
    bloklariSigdir();
}

// ============================================================
// DERS PENCERESİ
// ============================================================

// "+" butonuna basınca: "Syllabus ile ekle" / "Elle ekle" seçimi.
function secimEkraniniAc() {
    pencereBasligi.textContent = "Ders ekle";
    secimEkrani.hidden = false;
    form.hidden = true;
    pencere.showModal();
}

// Formdaki listeye (oturum veya değerlendirme) bir satır ekler ve alanlarını doldurur.
function satirEkle(sablonId, liste, veri = {}) {
    const satir = document.getElementById(sablonId).content.firstElementChild.cloneNode(true);
    // Kayıtlı bir satırsa kimliğini sakla ki güncellenirken aynı satır olarak kalsın.
    if (veri.id != null) satir.dataset.id = veri.id;
    satir.querySelectorAll("[data-alan]").forEach((alan) => {
        const deger = veri[alan.dataset.alan];
        if (deger != null) alan.value = deger;
    });
    liste.appendChild(satir);
}

// TEK FORM BİLEŞENİ: ders formunu verilen başlangıç verisiyle açar.
//   dersFormunuAc()                 -> boş form (elle ekleme)
//   dersFormunuAc(ders)             -> kayıtlı dersi düzenleme (ders.id var)
//   dersFormunuAc({kod: ..., ...})  -> ön doldurulmuş yeni ders (ileride syllabus'tan)
function dersFormunuAc(baslangicVerisi = {}) {
    duzenlenenDersId = baslangicVerisi.id ?? null;
    pencereBasligi.textContent = duzenlenenDersId ? "Dersi düzenle" : "Ders ekle";
    silDugmesi.hidden = !duzenlenenDersId;

    form.reset();
    for (const ad of ["kod", "ad", "kredi", "akts", "devamsizlik_hakki", "notlar"]) {
        form.elements[ad].value = baslangicVerisi[ad] ?? "";
    }
    form.elements.renk.value = baslangicVerisi.renk || siradakiRenk;

    // Oturumlar: en az bir (boş) satırla başla.
    oturumListesi.replaceChildren();
    const oturumlar = baslangicVerisi.oturumlar?.length ? baslangicVerisi.oturumlar : [{}];
    for (const oturum of oturumlar) satirEkle("oturum-sablonu", oturumListesi, oturum);

    // Değerlendirme kalemleri: varsa bölüm açık gelsin.
    degerlendirmeListesi.replaceChildren();
    const kalemler = baslangicVerisi.degerlendirmeler || [];
    for (const kalem of kalemler) satirEkle("degerlendirme-sablonu", degerlendirmeListesi, kalem);
    degerlendirmeBolumu.open = kalemler.length > 0;

    mesajGoster(kayitHatasi, "");
    secimEkrani.hidden = true;
    form.hidden = false;
    if (!pencere.open) pencere.showModal();
    formuDogrula();
    form.elements.kod.focus();
}

// Bir satırdaki alanları {alan adı: değer} olarak okur.
function satiriOku(satir) {
    const veri = {};
    if (satir.dataset.id) veri.id = Number(satir.dataset.id);
    satir.querySelectorAll("[data-alan]").forEach((alan) => {
        veri[alan.dataset.alan] = alan.value.trim();
    });
    return veri;
}

// Formun tamamını sunucuya gönderilecek ders nesnesine çevirir.
function formuOku() {
    const ders = {};
    for (const ad of ["kod", "ad", "kredi", "akts", "devamsizlik_hakki", "renk", "notlar"]) {
        ders[ad] = form.elements[ad].value.trim();
    }
    ders.oturumlar = [...oturumListesi.children].map((satir) => {
        const oturum = satiriOku(satir);
        oturum.gun = Number(oturum.gun);
        return oturum;
    });
    ders.degerlendirmeler = [...degerlendirmeListesi.children].map(satiriOku);
    return ders;
}

// Her değişiklikte çalışır: eksik alanları kırmızı yapar, uyarıları günceller,
// form geçerli değilse Kaydet butonunu pasif yapar.
function formuDogrula() {
    let gecerli = true;

    // 1) Tek tek alanlar: boş zorunlu alan, hatalı saat, negatif sayı.
    form.querySelectorAll("input, select").forEach((alan) => {
        const deger = alan.value.trim();
        let eksik = false;
        if ("zorunlu" in alan.dataset && deger === "") eksik = true;
        if ("saat" in alan.dataset && deger !== "" && !SAAT_KALIBI.test(deger)) eksik = true;
        if (alan.type === "number" && deger !== "" && Number(deger) < 0) eksik = true;
        alan.classList.toggle("eksik", eksik);
        if (eksik) gecerli = false;
    });

    // 2) Oturum saatleri: bitiş başlangıçtan sonra mı, takvim aralığında mı?
    let bitisHatasi = false;
    let takvimDisi = false;
    for (const satir of oturumListesi.children) {
        const baslangicAlani = satir.querySelector('[data-alan="baslangic"]');
        const bitisAlani = satir.querySelector('[data-alan="bitis"]');
        const baslangic = baslangicAlani.value.trim();
        const bitis = bitisAlani.value.trim();
        if (!SAAT_KALIBI.test(baslangic) || !SAAT_KALIBI.test(bitis)) continue;
        if (bitis <= baslangic) {
            bitisAlani.classList.add("eksik");
            bitisHatasi = true;
            gecerli = false;
        } else if (saatiSayiyaCevir(baslangic) < AYARLAR.ilkSaat || saatiSayiyaCevir(bitis) > AYARLAR.sonSaat) {
            takvimDisi = true;
        }
    }
    mesajGoster(oturumHatasi, bitisHatasi ? "Bitiş saati başlangıçtan sonra olmalı." : "");
    mesajGoster(oturumUyarisi, takvimDisi
        ? `Takvim ${saatYazisi(AYARLAR.ilkSaat)}-${saatYazisi(AYARLAR.sonSaat)} arasını gösteriyor; bu aralığın dışına taşan kısım takvimde görünmez.`
        : "");

    // Tek oturum kaldıysa silinemesin (en az 1 oturum zorunlu).
    const tekOturum = oturumListesi.children.length <= 1;
    oturumListesi.querySelectorAll(".satir-sil").forEach((dugme) => { dugme.disabled = tekOturum; });

    // 3) Değerlendirme ağırlıklarının toplamı (kaydı engellemez, sadece uyarır).
    const agirliklar = [...degerlendirmeListesi.querySelectorAll('[data-alan="agirlik"]')];
    if (agirliklar.length === 0) {
        mesajGoster(agirlikToplami, "");
    } else {
        let toplam = agirliklar.reduce((ara, alan) => ara + (Number(alan.value) || 0), 0);
        toplam = Math.round(toplam * 100) / 100;
        const tamam = toplam === 100;
        mesajGoster(agirlikToplami, tamam ? "Toplam: %100" : `Toplam: %${toplam} — ağırlıkların toplamı %100 değil.`);
        agirlikToplami.classList.toggle("uyari", !tamam);
    }

    kaydetDugmesi.disabled = !gecerli;
    return gecerli;
}

async function dersiKaydet() {
    if (!formuDogrula()) return;
    try {
        if (duzenlenenDersId) {
            await istekGonder("PUT", `/api/dersler/${duzenlenenDersId}`, formuOku());
        } else {
            await istekGonder("POST", "/api/dersler", formuOku());
        }
        pencere.close();
        await dersleriYukle();
    } catch (hata) {
        mesajGoster(kayitHatasi, hata.message);
    }
}

async function dersiSil() {
    const ders = dersler.find((d) => d.id === duzenlenenDersId);
    if (!ders || !confirm(`"${ders.kod}" dersi silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
        await istekGonder("DELETE", `/api/dersler/${ders.id}`);
        pencere.close();
        await dersleriYukle();
    } catch (hata) {
        mesajGoster(kayitHatasi, hata.message);
    }
}

// ============================================================
// OLAYLAR
// ============================================================

document.getElementById("ekle-dugmesi").addEventListener("click", secimEkraniniAc);
document.getElementById("elle-ekle").addEventListener("click", () => dersFormunuAc());
document.getElementById("pencere-kapat").addEventListener("click", () => pencere.close());
document.getElementById("vazgec-dugmesi").addEventListener("click", () => pencere.close());
silDugmesi.addEventListener("click", dersiSil);

document.getElementById("oturum-ekle").addEventListener("click", () => {
    satirEkle("oturum-sablonu", oturumListesi);
    formuDogrula();
});
document.getElementById("degerlendirme-ekle").addEventListener("click", () => {
    satirEkle("degerlendirme-sablonu", degerlendirmeListesi);
    formuDogrula();
});

// Satırdaki "×" butonu o satırı siler.
form.addEventListener("click", (olay) => {
    const silDugmesi = olay.target.closest(".satir-sil");
    if (!silDugmesi) return;
    silDugmesi.closest(".satir").remove();
    formuDogrula();
});

// Formda her yazışta/seçimde kontrolleri yenile.
form.addEventListener("input", formuDogrula);

// Saat alanından çıkınca "9:30" gibi yazımları "09:30" yap.
form.addEventListener("focusout", (olay) => {
    if (olay.target.matches("[data-saat]")) {
        olay.target.value = saatiDuzelt(olay.target.value);
        formuDogrula();
    }
});

form.addEventListener("submit", (olay) => {
    olay.preventDefault();
    dersiKaydet();
});

// Takvimde bir bloğa tıklanınca o dersi düzenleme modunda aç.
// (Geçici çözüm: ileride burada dersin sağ paneli açılacak.)
izgara.addEventListener("click", (olay) => {
    const blok = olay.target.closest(".ders-blogu");
    if (!blok) return;
    const ders = dersler.find((d) => d.id === Number(blok.dataset.dersId));
    if (ders) dersFormunuAc(ders);
});

// ============================================================
// BAŞLANGIÇ
// ============================================================

// Sayfa yenilenince tarayıcı eski kaydırma konumunu hatırlamasın:
// her açılışta sol üstten (Pazartesi, 09:00) başla.
takvim.scrollTo(0, 0);

// Pencere boyutu değişince satır yüksekliği ve sütun genişliği de değişir;
// blok yazılarını yeni boyuta göre yeniden sığdır.
new ResizeObserver(bloklariSigdir).observe(takvim);

dersleriYukle();
