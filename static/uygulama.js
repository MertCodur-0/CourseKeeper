// DersTakip'in tarayıcı tarafı: dersleri sunucudan alır, takvime blok olarak
// çizer ve ders ekleme/düzenleme formunu yönetir.

// ============================================================
// DURUM
// ============================================================

let dersler = [];               // sunucudan gelen bütün dersler
let siradakiRenk = null;        // yeni derse önerilecek (kullanılmayan ilk) renk
let duzenlenenDersId = null;    // formda açık olan dersin kimliği (yeni derste null)
let haftaKaymasi = 0;           // gösterilen hafta: 0 = bu hafta, -1 = geçen hafta, 1 = gelecek hafta

const AY_KISALTMALARI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

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
const degerlendirmeEkle = document.getElementById("degerlendirme-ekle");
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

// Tam saat olmayan (eski) değeri yuvarlar.
// yon "asagi": "09:30" -> "09:00" (başlangıçlar), yon "yukari": "10:20" -> "11:00" (bitişler)
function saatiYuvarla(saat, yon) {
    const sayi = saatiSayiyaCevir(saat);
    return saatYazisi(Math.min(yon === "asagi" ? Math.floor(sayi) : Math.ceil(sayi), 23));
}

// Bir oturumun veya sınavın takvimde kapladığı aralık (sayı olarak, tam saate yuvarlanmış).
// Bitiş verilmemişse süre 1 saat kabul edilir.
function saatAraligi(baslangic, bitis) {
    const bas = Math.floor(saatiSayiyaCevir(baslangic));
    const bit = bitis ? Math.ceil(saatiSayiyaCevir(bitis)) : bas + 1;
    return { bas, bit };
}

// Paletteki rengi anahtarından bulur ({kod: arka plan, yazi: yazı rengi}).
function renkBul(anahtar) {
    return AYARLAR.renkler.find((renk) => renk.anahtar === anahtar) || AYARLAR.renkler[0];
}

// Gösterilen haftanın 7 günü (Pazartesi'den Pazar'a), Date olarak.
function gosterilenHafta() {
    const [yil, ay, gun] = AYARLAR.bugun.split("-").map(Number);
    const bugun = new Date(yil, ay - 1, gun);
    // getDay(): Pazar 0, Pazartesi 1. Bu hesap Pazartesi'den kaç gün sonra olduğumuzu verir.
    const pazartesidenBeri = (bugun.getDay() + 6) % 7;
    const pazartesi = gun - pazartesidenBeri + 7 * haftaKaymasi;
    // Date, ay sınırını aşan gün sayısını kendisi düzeltir (ör. 32 Ekim -> 1 Kasım).
    return AYARLAR.gunler.map((_, sira) => new Date(yil, ay - 1, pazartesi + sira));
}

// Date -> "2026-11-15" (veritabanındaki tarih biçimi)
function tarihYazisi(tarih) {
    const ay = String(tarih.getMonth() + 1).padStart(2, "0");
    const gun = String(tarih.getDate()).padStart(2, "0");
    return `${tarih.getFullYear()}-${ay}-${gun}`;
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

// ---------- Çakışan bloklar: "boşluk doldurma" düzeni ----------
// Çakışan bloklar sütunu yan yana paylaşır; ama bir blok tek başına kaldığı saat
// diliminde sütunun tamamını doldurur. Böylece bloklar L veya basamak şeklini alır.

// Bloklar arasındaki boşluklar ve köşe yuvarlaklığı (piksel). Sadece burada tanımlı.
const BLOK_PAYI = 1.5;        // her bloğun komşusuna bakan kenarından bırakılan pay (iki blok arası 3px)
const SUTUN_KENAR_PAYI = 4;   // sütunun sağ ve sol kenarında bırakılan pay
const KOSE_YARICAPI = 14;     // dış köşelerin yuvarlaklığı
const DAR_KOSE_YARICAPI = 8;  // üç ve daha fazla blok yan yana gelince (dar parçalar) kullanılır
// İç köşeler, içine oturan komşu bloğun dış köşesini sabit aralıkla sarsın diye
// dış köşeden iki pay (blok arası boşluk) kadar geniş yuvarlanır.
const IC_KOSE_FARKI = 2 * BLOK_PAYI;
const KOSE_ADIMI = 6;         // yuvarlak köşe kaç küçük düz parçayla çizilir

// İki oran (0-1 arası sütun payı) aynı mı? (Küsurat hatalarına karşı küçük bir payla.)
function ayniOran(a, b) {
    return Math.abs(a - b) < 0.0001;
}

// Sütunun kenarına (0 veya 1) denk gelen kenarda geniş, blok arasına denk gelende dar pay.
function yatayPay(oran) {
    return ayniOran(oran, 0) || ayniOran(oran, 1) ? SUTUN_KENAR_PAYI : BLOK_PAYI;
}

// Bir günün bloklarını yerleştirir. Her bloğa şunları yazar:
//   serit       : çakışma grubundaki şerit numarası (0 = en sol)
//   seritSayisi : grupta aynı anda en çok kaç blok olduğu (k)
//   dilimler    : bloğun her zaman dilimindeki yeri [{ust, alt, sol, sag}]
//                 (ust/alt saat, sol/sag sütun genişliğinin 0-1 arası payı)
function cakismalariYerlestir(bloklar) {
    const sirali = [...bloklar].sort((a, b) => a.bas - b.bas || a.bit - b.bit);

    // 1) Çakışma grupları (zincirleme değenler aynı grup) ve şerit numaraları.
    const gruplar = [];
    let grup = null;
    let grupBitisi = -Infinity;   // gruptaki en geç bitiş saati
    let seritBitisleri = [];      // her şeritteki son bloğun bitiş saati
    for (const blok of sirali) {
        // Bu blok öncekilerin hepsi bittikten sonra başlıyorsa yeni grup başlar.
        if (blok.bas >= grupBitisi) {
            grup = [];
            gruplar.push(grup);
            seritBitisleri = [];
            grupBitisi = -Infinity;
        }
        // O an boş olan en küçük numaralı şeride yerleş, yoksa yeni şerit aç.
        let serit = seritBitisleri.findIndex((bitis) => bitis <= blok.bas);
        if (serit === -1) serit = seritBitisleri.length;
        seritBitisleri[serit] = blok.bit;
        blok.serit = serit;
        grup.push(blok);
        grupBitisi = Math.max(grupBitisi, blok.bit);
    }

    // 2) Her grubu zaman dilimlerine böl; her dilimde sütunu o an aktif bloklara eşit paylaştır.
    for (const grup of gruplar) {
        const seritSayisi = Math.max(...grup.map((blok) => blok.serit)) + 1;
        for (const blok of grup) {
            blok.seritSayisi = seritSayisi;
            blok.dilimler = [];
        }
        // Gruptaki bütün başlangıç/bitiş saatleri, küçükten büyüğe.
        const sinirlar = [...new Set(grup.flatMap((blok) => [blok.bas, blok.bit]))].sort((a, b) => a - b);
        for (let i = 0; i < sinirlar.length - 1; i++) {
            const ust = sinirlar[i];
            const alt = sinirlar[i + 1];
            const aktifler = grup
                .filter((blok) => blok.bas <= ust && blok.bit >= alt)
                .sort((a, b) => a.serit - b.serit);
            aktifler.forEach((blok, sira) => {
                blok.dilimler.push({
                    ust, alt,
                    sol: sira / aktifler.length,
                    sag: (sira + 1) / aktifler.length,
                });
            });
        }
    }
    return sirali;
}

// Bloğun şeklini oluşturan dikdörtgenler, yukarıdan aşağıya.
// Dikey konum bloğun kendi yüksekliğine oranlıdır (0 = bloğun üstü, 1 = altı).
// Art arda gelen aynı genişlikteki dilimler tek dikdörtgende birleşir.
function blokParcalari(blok) {
    const parcalar = [];
    for (const dilim of blok.dilimler) {
        const onceki = parcalar[parcalar.length - 1];
        const alt = (dilim.alt - blok.bas) / (blok.bit - blok.bas);
        if (onceki && ayniOran(onceki.sol, dilim.sol) && ayniOran(onceki.sag, dilim.sag)) {
            onceki.alt = alt;
        } else {
            const ust = (dilim.ust - blok.bas) / (blok.bit - blok.bas);
            parcalar.push({ ust, alt, sol: dilim.sol, sag: dilim.sag });
        }
    }
    return parcalar;
}

// Bloğun şeklini CSS "clip-path: polygon(...)" değeri olarak verir.
// Her köşe noktası "yüzde + piksel" olarak yazılır (ör. calc(50% + 1.5px)):
// yüzdeler sütun genişliğine ve blok yüksekliğine oranlı olduğundan pencere boyutu
// değişince şekli tarayıcı kendisi yeniden hesaplar.
function blokSekli(blok) {
    const parcalar = blokParcalari(blok);
    const ilk = parcalar[0];
    const son = parcalar[parcalar.length - 1];

    // Köşe noktaları, sol üstten başlayıp saat yönünde. x, y: oran; px, py: piksel payı.
    // Sol kenarlar sağa, sağ kenarlar sola, üst kenarlar aşağı, alt kenarlar yukarı çekilir (pay).
    const koseler = [
        { x: ilk.sol, y: 0, px: yatayPay(ilk.sol), py: BLOK_PAYI },
        { x: ilk.sag, y: 0, px: -yatayPay(ilk.sag), py: BLOK_PAYI },
    ];
    // Sağ kenar boyunca aşağı: genişliğin değiştiği her yerde bir basamak.
    for (let i = 0; i < parcalar.length - 1; i++) {
        const ust = parcalar[i];
        const alt = parcalar[i + 1];
        if (ayniOran(ust.sag, alt.sag)) continue;
        // Daralıyorsa basamak üstteki parçanın alt kenarıdır, genişliyorsa alttakinin üst kenarı.
        const py = alt.sag < ust.sag ? -BLOK_PAYI : BLOK_PAYI;
        koseler.push({ x: ust.sag, y: alt.ust, px: -yatayPay(ust.sag), py });
        koseler.push({ x: alt.sag, y: alt.ust, px: -yatayPay(alt.sag), py });
    }
    koseler.push({ x: son.sag, y: 1, px: -yatayPay(son.sag), py: -BLOK_PAYI });
    koseler.push({ x: son.sol, y: 1, px: yatayPay(son.sol), py: -BLOK_PAYI });
    // Sol kenar boyunca yukarı.
    for (let i = parcalar.length - 2; i >= 0; i--) {
        const ust = parcalar[i];
        const alt = parcalar[i + 1];
        if (ayniOran(ust.sol, alt.sol)) continue;
        const py = alt.sol > ust.sol ? -BLOK_PAYI : BLOK_PAYI;
        koseler.push({ x: alt.sol, y: alt.ust, px: yatayPay(alt.sol), py });
        koseler.push({ x: ust.sol, y: alt.ust, px: yatayPay(ust.sol), py });
    }

    // Kenarlar hep yatay veya dikeydir. Bir köşeden diğerine gidiş yönü: [x yönü, y yönü].
    function yon(a, b) {
        return ayniOran(a.y, b.y) && a.py === b.py ? [Math.sign(b.x - a.x), 0] : [0, Math.sign(b.y - a.y)];
    }

    const yaricap = blok.seritSayisi >= 3 ? DAR_KOSE_YARICAPI : KOSE_YARICAPI;   // dış köşe yarıçapı
    const noktalar = [];
    koseler.forEach((kose, sira) => {
        const onceki = koseler[(sira + koseler.length - 1) % koseler.length];
        const sonraki = koseler[(sira + 1) % koseler.length];
        const [gx, gy] = yon(onceki, kose);    // köşeye geliş yönü
        const [cx, cy] = yon(kose, sonraki);   // köşeden çıkış yönü
        const disKose = gx * cy - gy * cx > 0; // saat yönünde sağa dönüş = dış (dışbükey) köşe
        const r = disKose ? yaricap : yaricap + IC_KOSE_FARKI;
        // Köşe çeyrek daireyle yuvarlanır (küçük düz parçalarla). Aynı hesap iç köşede
        // içe doğru, dış köşede dışa doğru kavis verir.
        for (let adim = 0; adim <= KOSE_ADIMI; adim++) {
            const aci = (adim / KOSE_ADIMI) * Math.PI / 2;
            const gelis = r * (Math.sin(aci) - 1);
            const cikis = r * (1 - Math.cos(aci));
            noktalar.push([kose.x, kose.y, kose.px + gx * gelis + cx * cikis, kose.py + gy * gelis + cy * cikis]);
        }
    });

    const yazi = noktalar.map(([x, y, px, py]) =>
        `calc(${+(x * 100).toFixed(3)}% + ${+px.toFixed(2)}px) calc(${+(y * 100).toFixed(3)}% + ${+py.toFixed(2)}px)`);
    return `polygon(${yazi.join(", ")})`;
}

// Yazının ortalanacağı "çekirdek" alan: bloğun bütün süresi boyunca kapladığı ortak dikey şerit.
// İki blok çakışınca bu, bloğun kendi şerididir (sütunun yarısı); çakışma yoksa tüm sütundur.
// Değerler bloğun kendi alanına oranlıdır (0-1).
function yaziAlani(blok) {
    const parcalar = blokParcalari(blok);
    const sol = Math.max(...parcalar.map((parca) => parca.sol));
    const sag = Math.min(...parcalar.map((parca) => parca.sag));
    // Ortak şerit en az bir şerit genişliğindeyse (sütun / k) yazı oraya ortalanır.
    if (sag - sol >= 1 / blok.seritSayisi - 0.0001) return { sol, sag, ust: 0, alt: 1 };
    // Nadir durum (üç ve üzeri blok iç içe geçince ortak şerit daralabilir veya hiç kalmaz):
    // yazı, bloğun en büyük parçasına ortalanır.
    const alan = (parca) => (parca.alt - parca.ust) * (parca.sag - parca.sol);
    return parcalar.reduce((enBuyuk, parca) => (alan(parca) > alan(enBuyuk) ? parca : enBuyuk));
}

// Bloklardaki ve şerit etiketlerindeki "⋯" butonu: basınca dersin düzenleme formu açılır.
function menuDugmesiOlustur() {
    const dugme = document.createElement("button");
    dugme.type = "button";
    dugme.className = "menu-dugmesi";
    dugme.textContent = "⋯";
    dugme.title = "Dersi düzenle";
    dugme.setAttribute("aria-label", "Dersi düzenle");
    return dugme;
}

// Takvimdeki bir bloğu (ders oturumu veya saatli sınav) oluşturur.
// Dikey konum ve yükseklik stil.css'te --baslangic ve --sure değerlerinden hesaplanır.
// Yapı: blok (sütunun tam genişliği, bloğun tam süresi; kendisi görünmez)
//         > kutu     : renkli şekil (L, basamak veya dikdörtgen), tıklanan kısım
//         > çekirdek : yazıların ortalandığı alan > içerik (yazılar) + "⋯" butonu
// yerlesim: { ders, bas, bit, serit, seritSayisi, dilimler, renk, altYazi, ipucu }
function blokOlustur(yerlesim) {
    const blok = document.createElement("div");
    blok.className = "ders-blogu";
    // Tıklama noktası: blok, ait olduğu dersin kimliğini taşır.
    blok.dataset.dersId = yerlesim.ders.id;
    blok.style.setProperty("--baslangic", yerlesim.bas);            // ör. 9
    blok.style.setProperty("--sure", yerlesim.bit - yerlesim.bas);  // ör. 2
    // Yazı sığmayıp kesilirse bilgiler üzerine gelince buradan okunur.
    blok.title = yerlesim.ipucu;

    const kutu = document.createElement("button");
    kutu.type = "button";
    kutu.className = "blok-kutu";
    kutu.setAttribute("aria-label", yerlesim.ipucu);
    kutu.style.background = yerlesim.renk.kod;
    // Şeklin dışında kalan kısım görünmez ve fareye tepki vermez.
    kutu.style.setProperty("clip-path", blokSekli(yerlesim));

    const alan = yaziAlani(yerlesim);
    const cekirdek = document.createElement("div");
    cekirdek.className = "blok-cekirdek";
    cekirdek.style.color = yerlesim.renk.yazi;
    cekirdek.style.setProperty("left", `calc(${alan.sol * 100}% + ${yatayPay(alan.sol)}px)`);
    cekirdek.style.setProperty("right", `calc(${(1 - alan.sag) * 100}% + ${yatayPay(alan.sag)}px)`);
    cekirdek.style.setProperty("top", `calc(${alan.ust * 100}% + ${BLOK_PAYI}px)`);
    cekirdek.style.setProperty("bottom", `calc(${(1 - alan.alt) * 100}% + ${BLOK_PAYI}px)`);

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

    // Ders bloğunda derslik, sınav bloğunda tür etiketi (ör. "VİZE 1").
    const altYazi = document.createElement("span");
    altYazi.className = "blok-derslik";
    altYazi.textContent = yerlesim.altYazi;

    icerik.append(kod, altYazi);
    cekirdek.append(icerik, menuDugmesiOlustur());
    blok.append(kutu, cekirdek);
    return blok;
}

// Saati olmayan (veya takvim saatlerinin dışında kalan) sınav için şeritteki küçük etiket.
function seritEtiketiOlustur(ders, yazi) {
    const renk = renkBul(ders.sinav_rengi);
    const etiket = document.createElement("div");
    etiket.className = "serit-etiketi";
    etiket.dataset.dersId = ders.id;
    etiket.style.background = renk.kod;
    etiket.style.color = renk.yazi;
    etiket.title = yazi;

    const yaziDugmesi = document.createElement("button");
    yaziDugmesi.type = "button";
    yaziDugmesi.className = "serit-yazi";
    yaziDugmesi.textContent = yazi;

    etiket.append(yaziDugmesi, menuDugmesiOlustur());
    return etiket;
}

// Yazı bloğa sığmıyorsa sırayla denenecek basamaklar: [kod ile derslik arası boşluk, yazı boyutu] (px).
// Önce aradaki boşluk daralır, sonra yazı küçülür. İlk basamak normal görünümdür.
const SIGDIRMA_BASAMAKLARI = [
    [12, 12.5], [8, 12.5], [4, 12.5], [2, 12.5],
    [2, 11.5], [2, 10.5], [1, 9.5], [1, 8.5], [0, 7.5],
];

// Bloğun yazısını çekirdek alanına sığan ilk basamağa ayarlar.
// En küçük basamak da sığmazsa taşan kısım çekirdek alanın içinde kesilir (dışarı taşmaz).
function bloguSigdir(blok) {
    const kutu = blok.querySelector(".blok-cekirdek");
    const icerik = blok.querySelector(".blok-icerik");
    for (const [bosluk, punto] of SIGDIRMA_BASAMAKLARI) {
        blok.style.setProperty("--blok-bosluk", bosluk + "px");
        blok.style.setProperty("--blok-punto", punto + "px");
        // 4px: yazı alanın kenarına yapışmasın diye bırakılan pay.
        const sigiyor = icerik.offsetHeight <= kutu.clientHeight - 4
            && icerik.offsetWidth <= kutu.clientWidth - 4;
        if (sigiyor) break;
    }
}

function bloklariSigdir() {
    document.querySelectorAll(".ders-blogu").forEach(bloguSigdir);
}

// Gün başlıklarındaki tarihleri ve gezinme satırındaki yazıyı gösterilen haftaya göre yazar.
function basliklariYaz(hafta) {
    document.querySelectorAll(".gun-baslik, .gun-sutunu").forEach((eleman) => {
        const tarih = hafta[Number(eleman.dataset.gun)];
        eleman.classList.toggle("bugun", tarihYazisi(tarih) === AYARLAR.bugun);
        if (eleman.classList.contains("gun-baslik")) {
            eleman.querySelector("span").textContent =
                `${AYARLAR.gunler[eleman.dataset.gun]} ${tarih.getDate()}`;
        }
    });
    const ilk = hafta[0];
    const son = hafta[6];
    document.getElementById("hafta-yazisi").textContent =
        `${ilk.getDate()} ${AY_KISALTMALARI[ilk.getMonth()]} – ${son.getDate()} ${AY_KISALTMALARI[son.getMonth()]} ${son.getFullYear()}`;
}

// Takvimi gösterilen haftaya göre baştan çizer.
// Düzenli ders blokları her haftada, sınavlar sadece tarihlerinin düştüğü haftada görünür.
function takvimiCiz() {
    izgara.querySelectorAll(".ders-blogu, .serit-etiketi").forEach((eleman) => eleman.remove());

    const hafta = gosterilenHafta();
    basliklariYaz(hafta);
    let seritDolu = false;

    document.querySelectorAll(".gun-sutunu").forEach((gunSutunu) => {
        const gun = Number(gunSutunu.dataset.gun);
        const tarih = tarihYazisi(hafta[gun]);
        const seritHucresi = izgara.querySelector(`.serit-hucre[data-gun="${gun}"]`);
        const yerlesimler = [];

        for (const ders of dersler) {
            // Haftalık oturumlar
            for (const oturum of ders.oturumlar) {
                if (oturum.gun !== gun) continue;
                // Takvimin dışına taşan kısım kırpılır (09:00 öncesi, 21:00 sonrası).
                const aralik = saatAraligi(oturum.baslangic, oturum.bitis);
                const bas = Math.max(aralik.bas, AYARLAR.ilkSaat);
                const bit = Math.min(aralik.bit, AYARLAR.sonSaat);
                if (bit <= bas) continue;
                yerlesimler.push({
                    ders, bas, bit,
                    renk: renkBul(ders.renk),
                    altYazi: oturum.derslik,
                    ipucu: `${ders.kod} · ${oturum.derslik} · ${oturum.baslangic}-${oturum.bitis}`,
                });
            }

            // Tarihi bu güne denk gelen değerlendirme kalemleri (vize, final, quiz, ...)
            for (const kalem of ders.degerlendirmeler) {
                if (kalem.tarih !== tarih) continue;
                const tur = AYARLAR.degerlendirmeTurleri.find((t) => t.anahtar === kalem.tur);
                const etiket = tur ? tur.etiket : kalem.tur;
                const aralik = kalem.saat ? saatAraligi(kalem.saat, kalem.bitis_saat) : null;

                if (aralik && aralik.bas >= AYARLAR.ilkSaat && aralik.bit <= AYARLAR.sonSaat) {
                    // Saati takvime sığıyor: ders bloğu gibi ızgaraya yerleşir.
                    const bitisYazisi = kalem.bitis_saat || saatYazisi(aralik.bit);
                    yerlesimler.push({
                        ders, bas: aralik.bas, bit: aralik.bit,
                        renk: renkBul(ders.sinav_rengi),
                        altYazi: etiket,
                        ipucu: `${ders.kod} · ${etiket} · ${kalem.saat}-${bitisYazisi}`,
                    });
                } else {
                    // Saati yok ya da 09:00-21:00 dışında: üstteki şeritte küçük etiket.
                    let yazi = `${ders.kod} · ${etiket}`;
                    if (kalem.saat) yazi += ` · ${kalem.saat}` + (kalem.bitis_saat ? `-${kalem.bitis_saat}` : "");
                    seritHucresi.appendChild(seritEtiketiOlustur(ders, yazi));
                    seritDolu = true;
                }
            }
        }

        for (const yerlesim of cakismalariYerlestir(yerlesimler)) {
            gunSutunu.appendChild(blokOlustur(yerlesim));
        }
    });

    // Haftada hiç şerit etiketi yoksa şerit satırı hiç görünmez.
    izgara.querySelectorAll(".serit").forEach((hucre) => { hucre.hidden = !seritDolu; });
    bloklariSigdir();
}

// Gösterilen haftayı değiştirir. kayma: -1 önceki, 1 sonraki, 0 bu haftaya dön.
function haftayiDegistir(kayma) {
    haftaKaymasi = kayma === 0 ? 0 : haftaKaymasi + kayma;
    takvimiCiz();
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

// Açılır listede o değer yoksa ekler (takvim saatleri dışında kalmış eski kayıt kaybolmasın diye).
function secenegiGarantile(liste, deger) {
    if (![...liste.options].some((secenek) => secenek.value === deger)) {
        liste.add(new Option(deger, deger));
    }
}

// Satırdaki bitiş saatini başlangıca uydurur:
// - başlangıçtan sonra olmayan bitiş seçenekleri pasif olur,
// - bitiş geçersiz kaldıysa (veya zorunlu olup boşsa) başlangıç + 1 saat yapılır,
// - opsiyonel saatte (değerlendirme) başlangıç boşsa bitiş de boşalır.
function bitisiAyarla(satir) {
    const baslangic = satir.querySelector('[data-saat="asagi"]');
    const bitis = satir.querySelector('[data-saat="yukari"]');
    const zorunlu = "zorunlu" in bitis.dataset;

    for (const secenek of bitis.options) {
        // "09:00" <= "11:00" karşılaştırması metin olarak da doğru çalışır.
        secenek.disabled = secenek.value !== "" && baslangic.value !== "" && secenek.value <= baslangic.value;
    }
    if (baslangic.value === "") {
        if (!zorunlu) {
            bitis.value = "";
            bitis.disabled = true;
        }
        return;
    }
    bitis.disabled = false;
    const gecersiz = bitis.value !== "" && bitis.value <= baslangic.value;
    if (gecersiz || (zorunlu && bitis.value === "")) {
        const birSaatSonra = saatYazisi(saatiSayiyaCevir(baslangic.value) + 1);
        secenegiGarantile(bitis, birSaatSonra);
        bitis.value = birSaatSonra;
    }
}

// Formdaki listeye (oturum veya değerlendirme) bir satır ekler ve alanlarını doldurur.
function satirEkle(sablonId, liste, veri = {}) {
    const satir = document.getElementById(sablonId).content.firstElementChild.cloneNode(true);
    // Kayıtlı bir satırsa kimliğini sakla ki güncellenirken aynı satır olarak kalsın.
    if (veri.id != null) satir.dataset.id = veri.id;
    satir.querySelectorAll("[data-alan]").forEach((alan) => {
        let deger = veri[alan.dataset.alan];
        if (deger == null) return;
        if (alan.dataset.saat) {
            // Eski kayıtta tam saat olmayan değer: başlangıç aşağı, bitiş yukarı yuvarlanır.
            deger = saatiYuvarla(deger, alan.dataset.saat);
            secenegiGarantile(alan, deger);
        }
        alan.value = deger;
    });
    liste.appendChild(satir);
    bitisiAyarla(satir);
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
    // Eski dersin hedef notu yoksa liste boş (kırmızı) gelir ve seçilmesi istenir.
    for (const ad of ["kod", "ad", "kredi", "akts", "devamsizlik_hakki", "hedef_not"]) {
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
    for (const ad of ["kod", "ad", "kredi", "akts", "devamsizlik_hakki", "hedef_not", "renk"]) {
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

    // 1) Tek tek alanlar: boş zorunlu alan, negatif sayı.
    form.querySelectorAll("input, select").forEach((alan) => {
        const deger = alan.value.trim();
        let eksik = false;
        if ("zorunlu" in alan.dataset && deger === "") eksik = true;
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
        if (baslangic === "" || bitis === "") continue;
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

    // 3) Değerlendirme türleri: bir tür derste en fazla bir kez seçilebilir.
    //    Başka satırda seçilmiş tür, diğer satırların listesinde pasif görünür.
    const turAlanlari = [...degerlendirmeListesi.querySelectorAll('[data-alan="tur"]')];
    const secilenTurler = turAlanlari.map((alan) => alan.value);
    for (const alan of turAlanlari) {
        for (const secenek of alan.options) {
            secenek.disabled = secenek.value !== "" && secenek.value !== alan.value
                && secilenTurler.includes(secenek.value);
        }
    }
    // Bütün türler kullanıldıysa yeni kalem eklenemez.
    degerlendirmeEkle.disabled = turAlanlari.length >= AYARLAR.degerlendirmeTurleri.length;

    // 4) Değerlendirme ağırlıklarının toplamı (kaydı engellemez, sadece uyarır).
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
degerlendirmeEkle.addEventListener("click", () => {
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
form.addEventListener("input", (olay) => {
    // Başlangıç saati değişince aynı satırdaki bitişi otomatik ayarla.
    if (olay.target.dataset.saat === "asagi") bitisiAyarla(olay.target.closest(".satir"));
    formuDogrula();
});

form.addEventListener("submit", (olay) => {
    olay.preventDefault();
    dersiKaydet();
});

// Hafta gezinme: ‹ önceki hafta, Bugün, › sonraki hafta.
document.getElementById("onceki-hafta").addEventListener("click", () => haftayiDegistir(-1));
document.getElementById("bugune-don").addEventListener("click", () => haftayiDegistir(0));
document.getElementById("sonraki-hafta").addEventListener("click", () => haftayiDegistir(1));

// Bloğa (veya şerit etiketine) tıklanınca çalışır. Şimdilik hiçbir şey yapmaz;
// ileride dersin sağ paneli buradan açılacak.
function dersTiklandi(ders) {
}

// Takvimdeki tıklamalar: "⋯" butonu düzenleme formunu açar, bloğun kendisi dersTiklandi'yi çağırır.
izgara.addEventListener("click", (olay) => {
    const tasiyici = olay.target.closest("[data-ders-id]");
    if (!tasiyici) return;
    const ders = dersler.find((d) => d.id === Number(tasiyici.dataset.dersId));
    if (!ders) return;
    if (olay.target.closest(".menu-dugmesi")) dersFormunuAc(ders);
    else dersTiklandi(ders);
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
