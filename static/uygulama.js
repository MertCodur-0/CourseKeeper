// DersTakip'in tarayıcı tarafı: dersleri sunucudan alır, takvime blok olarak
// çizer, ders ekleme/düzenleme formunu ve sağ paneli (not hesabı, notlar, bilgi) yönetir.

// ============================================================
// DURUM
// ============================================================

let dersler = [];               // sunucudan gelen bütün dersler
// Devamsızlık için gereken veri: şimdiki zaman, dönem, ders yapılmayan tarihler, yoklama kayıtları.
// Hesap ve arayüzü static/yoklama.js'tedir.
let yoklamaVerisi = { simdi: "", donem: null, ders_disi_tarihler: [], kayitlar: [] };
let siradakiRenk = null;        // yeni derse önerilecek (kullanılmayan ilk) renk
let duzenlenenDersId = null;    // formda açık olan dersin kimliği (yeni derste null)
let okumaNo = 0;                // her syllabus okumasının numarası (pencere kapanınca eski okuma yok sayılır)
let haftaKaymasi = 0;           // gösterilen hafta: 0 = bu hafta, -1 = geçen hafta, 1 = gelecek hafta

const AY_KISALTMALARI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// Sayfadaki parçalar
const takvim = document.getElementById("takvim");
const izgara = document.getElementById("izgara");
const pencere = document.getElementById("ders-penceresi");
const pencereBasligi = document.getElementById("pencere-basligi");
const secimEkrani = document.getElementById("secim-ekrani");
const syllabusEkrani = document.getElementById("syllabus-ekrani");
const birakmaAlani = document.getElementById("birakma-alani");
const dosyaGirdisi = document.getElementById("dosya-girdisi");
const okunuyor = document.getElementById("okunuyor");
const syllabusHatasi = document.getElementById("syllabus-hatasi");
const syllabusNotu = document.getElementById("syllabus-notu");
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
    // Dersler ve yoklama verisi birlikte alınır ki takvim ve panel ikisini de aynı anda görsün.
    const [sonuc, yoklama] = await Promise.all([
        istekGonder("GET", "/api/dersler"),
        istekGonder("GET", "/api/yoklama"),
    ]);
    dersler = sonuc.dersler;
    siradakiRenk = sonuc.siradaki_renk;
    yoklamaVerisiniAl(yoklama);
    takvimiCiz();
    paneliYenile();
    yoklamaDurumunuGuncelle();
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
    // Sınav bloğu ayrıca hangi kaleme ait olduğunu da taşır (panelde o satır vurgulanır).
    if (yerlesim.kalemId != null) blok.dataset.kalemId = yerlesim.kalemId;
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
    // Ders bloğuysa (sınav değilse) o günün yoklama durumunu sol üst köşede küçük simgeyle göster.
    if (yerlesim.oturum) yoklamaSimgesiEkle(blok, cekirdek, yerlesim.oturum, yerlesim.tarih);
    blok.append(kutu, cekirdek);
    return blok;
}

// Saati olmayan (veya takvim saatlerinin dışında kalan) sınav için şeritteki küçük etiket.
function seritEtiketiOlustur(ders, yazi, kalemId) {
    const renk = renkBul(ders.sinav_rengi);
    const etiket = document.createElement("div");
    etiket.className = "serit-etiketi";
    etiket.dataset.dersId = ders.id;
    etiket.dataset.kalemId = kalemId;
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

// Gösterilen haftaya göre bugünün başlığını vurgular ve gezinme satırındaki tarih aralığını yazar.
// (Gün başlıklarında sadece gün adı yazar; haftanın tarihleri gezinme satırında görünür.)
function basliklariYaz(hafta) {
    document.querySelectorAll(".gun-baslik, .gun-sutunu").forEach((eleman) => {
        const tarih = hafta[Number(eleman.dataset.gun)];
        eleman.classList.toggle("bugun", tarihYazisi(tarih) === AYARLAR.bugun);
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
                    oturum, tarih,   // yoklama simgesi için: hangi oturumun hangi günkü dersi
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
                        kalemId: kalem.id,
                        ipucu: `${ders.kod} · ${etiket} · ${kalem.saat}-${bitisYazisi}`,
                    });
                } else {
                    // Saati yok ya da 09:00-21:00 dışında: üstteki şeritte küçük etiket.
                    let yazi = `${ders.kod} · ${etiket}`;
                    if (kalem.saat) yazi += ` · ${kalem.saat}` + (kalem.bitis_saat ? `-${kalem.bitis_saat}` : "");
                    seritHucresi.appendChild(seritEtiketiOlustur(ders, yazi, kalem.id));
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
    seciliVurguyuGuncelle();
}

// Gösterilen haftayı değiştirir. kayma: -1 önceki, 1 sonraki, 0 bu haftaya dön.
function haftayiDegistir(kayma) {
    haftaKaymasi = kayma === 0 ? 0 : haftaKaymasi + kayma;
    takvimiCiz();
}

// ============================================================
// DERS PENCERESİ
// ============================================================

// Alt çubuktaki "Ders ekle" tuşuna basınca: "Syllabus ile ekle" / "Elle ekle" seçimi.
function secimEkraniniAc() {
    pencereBasligi.textContent = "Ders ekle";
    secimEkrani.hidden = false;
    syllabusEkrani.hidden = true;
    form.hidden = true;
    pencereyiAc(pencere);
}

// ---------- Syllabus ile ekleme ----------

// Dosya seçme / sürükleme ekranını açar.
function syllabusEkraniniAc() {
    pencereBasligi.textContent = "Syllabus ile ekle";
    secimEkrani.hidden = true;
    form.hidden = true;
    syllabusEkrani.hidden = false;
    okunuyorGoster(false);
    mesajGoster(syllabusHatasi, "");
}

// "Syllabus okunuyor..." göstergesini açar/kapatır (açıkken dosya alanı gizlenir).
function okunuyorGoster(acik) {
    okunuyor.hidden = !acik;
    birakmaAlani.hidden = acik;
}

function syllabusHatasiGoster(yazi) {
    okunuyorGoster(false);
    mesajGoster(syllabusHatasi, yazi + " Dersi “Elle ekle” ile kendin de girebilirsin.");
}

// Seçilen dosyayı sunucuya gönderir; okunan bilgilerle ders formunu ön doldurulmuş açar.
// API anahtarı sunucudadır, tarayıcıya hiç gelmez.
async function syllabusOku(dosya) {
    mesajGoster(syllabusHatasi, "");
    const turUygun = ["application/pdf", "image/png", "image/jpeg"].includes(dosya.type)
        || /\.(pdf|png|jpe?g)$/i.test(dosya.name);
    if (!turUygun) {
        syllabusHatasiGoster("Bu dosya türü desteklenmiyor. Lütfen PDF, PNG veya JPG dosyası seç.");
        return;
    }
    if (dosya.size > AYARLAR.syllabusEnFazlaMB * 1024 * 1024) {
        syllabusHatasiGoster(`Dosya çok büyük. En fazla ${AYARLAR.syllabusEnFazlaMB} MB'lık dosya yükleyebilirsin.`);
        return;
    }

    const buOkuma = ++okumaNo;
    okunuyorGoster(true);
    let sonuc;
    let hata = null;
    try {
        const veri = new FormData();
        veri.append("dosya", dosya);
        const yanit = await fetch("/api/syllabus", { method: "POST", body: veri });
        sonuc = await yanit.json();
        if (!yanit.ok) hata = sonuc.hata || "Syllabus okunamadı.";
    } catch {
        hata = "Sunucuya ulaşılamadı ya da yanıt anlaşılamadı. Sunucunun çalıştığından emin olup tekrar dene.";
    }
    // Bu arada pencere kapatıldıysa ya da başka bir okuma başladıysa sonucu yok say.
    if (buOkuma !== okumaNo || !pencere.open) return;
    if (hata) {
        syllabusHatasiGoster(hata);
        return;
    }
    dersFormunuAc(sonuc.ders, sonuc.uyarilar || []);
}

// Bir form alanını sarı işaretler; nedeni üzerine gelince görünür.
function alaniIsaretle(alan, aciklama) {
    alan.classList.add("emin-degil");
    alan.title = aciklama;
}

// Kullanıcı sarı alanı değiştirdiyse (kontrol etti demektir) işareti kaldırır.
function isaretiKaldir(alan) {
    alan.classList.remove("emin-degil");
    alan.removeAttribute("title");
    const satir = alan.closest(".satir");
    if (satir && !satir.querySelector(".emin-degil")) satir.querySelector(".satir-notu")?.remove();
}

// Formun üstündeki "Syllabus'tan okundu" notunu yazar. uyarilar null ise not gizlenir.
function syllabusNotunuYaz(uyarilar) {
    syllabusNotu.replaceChildren();
    syllabusNotu.hidden = uyarilar === null;
    if (uyarilar === null) return;
    const satirlar = [
        "Syllabus'tan okundu, lütfen kontrol et.",
        "Sarı alanlar: modelin emin olmadığı, yuvarlanan ya da takvim dışında kalan değerler. "
            + "Kırmızı alanlar: zorunlu ama belgede bulunamadı, sen doldur.",
        ...uyarilar,
    ];
    satirlar.forEach((yazi, sira) => {
        const satir = document.createElement("p");
        if (sira === 0) {
            const kalin = document.createElement("strong");
            kalin.textContent = yazi;
            satir.appendChild(kalin);
        } else {
            satir.textContent = yazi;
        }
        syllabusNotu.appendChild(satir);
    });
}

// Açılır listede o değer yoksa ekler (takvim saatleri dışında kalmış eski kayıt kaybolmasın diye).
function secenegiGarantile(liste, deger) {
    if (![...liste.options].some((secenek) => secenek.value === deger)) {
        liste.add(new Option(deger, deger));
    }
}

// Satırdaki bitiş saatini başlangıca uydurur:
// - başlangıçtan sonra olmayan bitiş seçenekleri pasif olur,
// - otomatikDoldur ise: bitiş geçersiz kaldıysa (veya zorunlu olup boşsa) başlangıç + 1 saat yapılır.
//   (Kullanıcı başlangıcı değiştirince. Satır ilk doldurulurken yapılmaz ki syllabus'ta
//   bulunamayan bitiş saati uydurulmasın, boş ve kırmızı kalsın.)
// - opsiyonel saatte (değerlendirme) başlangıç boşsa bitiş de boşalır.
function bitisiAyarla(satir, otomatikDoldur) {
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
    if (!otomatikDoldur) return;
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
    // Kalemin formda görünmeyen adı (eski sürümdeki ya da syllabus'taki) satırla birlikte taşınır.
    if (veri.ad) satir.dataset.ad = veri.ad;
    const notlar = [];
    satir.querySelectorAll("[data-alan]").forEach((alan) => {
        let deger = veri[alan.dataset.alan];
        // Syllabus'tan gelen satırda kontrol edilmesi gereken alan sarı işaretlenir.
        const aciklama = veri.isaretler?.[alan.dataset.alan];
        if (aciklama) {
            alaniIsaretle(alan, aciklama);
            notlar.push(`${alan.getAttribute("aria-label")}: ${aciklama}`);
        }
        if (deger == null) return;
        if (alan.type === "checkbox") {
            alan.checked = Boolean(deger);
            return;
        }
        if (alan.dataset.saat) {
            // Eski kayıtta tam saat olmayan değer: başlangıç aşağı, bitiş yukarı yuvarlanır.
            deger = saatiYuvarla(deger, alan.dataset.saat);
            secenegiGarantile(alan, deger);
        }
        alan.value = deger;
    });
    if (notlar.length > 0) {
        const not = document.createElement("small");
        not.className = "satir-notu";
        not.textContent = notlar.join(" · ");
        satir.appendChild(not);
    }
    liste.appendChild(satir);
    bitisiAyarla(satir, false);
}

// TEK FORM BİLEŞENİ: ders formunu verilen başlangıç verisiyle açar.
//   dersFormunuAc()                 -> boş form (elle ekleme)
//   dersFormunuAc(ders)             -> kayıtlı dersi düzenleme (ders.id var)
//   dersFormunuAc({kod: ..., ...}, uyarilar) -> syllabus'tan ön doldurulmuş yeni ders
//       (uyarilar: formun üstündeki notta gösterilecek ek satırlar)
function dersFormunuAc(baslangicVerisi = {}, syllabusUyarilari = null) {
    duzenlenenDersId = baslangicVerisi.id ?? null;
    pencereBasligi.textContent = duzenlenenDersId ? "Dersi düzenle" : "Ders ekle";
    silDugmesi.hidden = !duzenlenenDersId;

    form.reset();
    // Eski dersin hedef notu yoksa liste boş (kırmızı) gelir ve seçilmesi istenir.
    for (const ad of ["kod", "ad", "kredi", "akts", "devamsizlik_hakki", "lab_devamsizlik_hakki", "hedef_not", "devamsizlik_metni"]) {
        form.elements[ad].value = baslangicVerisi[ad] ?? "";
    }
    // Syllabus notu ve sarı işaretler (önceki açılıştan kalanlar temizlenir).
    syllabusNotunuYaz(syllabusUyarilari);
    form.querySelectorAll(".emin-degil").forEach(isaretiKaldir);
    for (const [ad, aciklama] of Object.entries(baslangicVerisi.isaretler || {})) {
        alaniIsaretle(form.elements[ad], aciklama);
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
    syllabusEkrani.hidden = true;
    form.hidden = false;
    pencereyiAc(pencere);
    formuDogrula();
    form.elements.kod.focus();
}

// Bir satırdaki alanları {alan adı: değer} olarak okur.
function satiriOku(satir) {
    const veri = {};
    if (satir.dataset.id) veri.id = Number(satir.dataset.id);
    if (satir.dataset.ad) veri.ad = satir.dataset.ad;
    satir.querySelectorAll("[data-alan]").forEach((alan) => {
        // Onay kutusu (ekstra puan) evet/hayır olarak, diğer alanlar yazı olarak okunur.
        veri[alan.dataset.alan] = alan.type === "checkbox" ? alan.checked : alan.value.trim();
    });
    return veri;
}

// Formun tamamını sunucuya gönderilecek ders nesnesine çevirir.
function formuOku() {
    const ders = {};
    for (const ad of ["kod", "ad", "kredi", "akts", "devamsizlik_hakki", "lab_devamsizlik_hakki", "hedef_not", "renk", "devamsizlik_metni"]) {
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

    // 1) Tek tek alanlar: boş zorunlu alan, negatif ya da üst sınırı aşan sayı.
    form.querySelectorAll("input, select").forEach((alan) => {
        const deger = alan.value.trim();
        let eksik = false;
        if ("zorunlu" in alan.dataset && deger === "") eksik = true;
        if (alan.type === "number" && deger !== "" && Number(deger) < 0) eksik = true;
        if (alan.type === "number" && alan.max !== "" && Number(deger) > Number(alan.max)) eksik = true;
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

    // 4) Değerlendirme ağırlıklarının özeti. Hiçbir durumda kaydı engellemez, sadece bilgilendirir.
    //    "Ekstra puan" işaretli kalemler normal toplama değil, ayrı bir ekstra toplamına sayılır.
    const kalemSatirlari = [...degerlendirmeListesi.children];
    let normalToplam = 0;
    let ekstraToplam = 0;
    for (const satir of kalemSatirlari) {
        const agirlik = Number(satir.querySelector('[data-alan="agirlik"]').value) || 0;
        if (satir.querySelector('[data-alan="ekstra_puan"]').checked) ekstraToplam += agirlik;
        else normalToplam += agirlik;
    }
    normalToplam = Math.round(normalToplam * 100) / 100;
    ekstraToplam = Math.round(ekstraToplam * 100) / 100;
    const ekstraYazisi = ekstraToplam > 0 ? ` + %${ekstraToplam} ekstra` : "";
    let ozet = "";
    if (kalemSatirlari.length === 0) {
        ozet = "";
    } else if (normalToplam === 100) {
        ozet = `Toplam: %100${ekstraYazisi}`;
    } else if (normalToplam < 100) {
        ozet = `Toplam: %${normalToplam}${ekstraYazisi}. Eksik: %${Math.round((100 - normalToplam) * 100) / 100}`;
    } else {
        // %100'ü aşmak hata değil: ekstra puanlı derslerde olur. Sakin bir bilgi notu yeter.
        ozet = `Toplam %${normalToplam}${ekstraYazisi}. Ekstra puan varsa ilgili kalemi “Ekstra puan” olarak işaretle.`;
    }
    mesajGoster(agirlikToplami, ozet);
    agirlikToplami.classList.toggle("tamam", normalToplam === 100);
    agirlikToplami.classList.toggle("uyari", normalToplam < 100);

    kaydetDugmesi.disabled = !gecerli;
    return gecerli;
}

async function dersiKaydet() {
    if (!formuDogrula()) return;
    try {
        if (duzenlenenDersId) {
            // Formdan çıkarılan oturumun yoklama kayıtları da silinir: önce onay istenir.
            // (Formda kalan oturumlar kimlikleriyle güncellenir, kayıtları yerinde durur.)
            const kalanlar = formuOku().oturumlar.map((oturum) => oturum.id);
            const ders = dersler.find((d) => d.id === duzenlenenDersId);
            for (const oturum of ders ? ders.oturumlar : []) {
                const kayitSayisi = yoklamaKayitSayisi(oturum.id);
                if (kalanlar.includes(oturum.id) || kayitSayisi === 0) continue;
                const onay = confirm(`${AYARLAR.gunler[oturum.gun]} ${oturum.baslangic}-${oturum.bitis} oturumunu sildin. `
                    + `Bu oturumun ${kayitSayisi} yoklama kaydı da silinecek. Devam edilsin mi?`);
                if (!onay) return;
            }
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

document.getElementById("elle-ekle").addEventListener("click", () => dersFormunuAc());

// Syllabus ile ekleme: dosya seçme butonu ve sürükle-bırak.
document.getElementById("syllabus-ekle").addEventListener("click", syllabusEkraniniAc);
document.getElementById("syllabus-elle-ekle").addEventListener("click", () => dersFormunuAc());
document.getElementById("dosya-sec").addEventListener("click", () => dosyaGirdisi.click());
dosyaGirdisi.addEventListener("change", () => {
    if (dosyaGirdisi.files.length > 0) syllabusOku(dosyaGirdisi.files[0]);
    dosyaGirdisi.value = "";   // aynı dosya tekrar seçilebilsin
});
// Pencereye bırakılan dosyayı tarayıcı kendi açmasın (sayfadan çıkılmasın).
for (const olayAdi of ["dragover", "drop"]) {
    pencere.addEventListener(olayAdi, (olay) => olay.preventDefault());
}
birakmaAlani.addEventListener("dragover", () => birakmaAlani.classList.add("suruklenen"));
birakmaAlani.addEventListener("dragleave", () => birakmaAlani.classList.remove("suruklenen"));
birakmaAlani.addEventListener("drop", (olay) => {
    birakmaAlani.classList.remove("suruklenen");
    const dosya = olay.dataTransfer.files[0];
    if (dosya) syllabusOku(dosya);
});
// Pencere kapanınca süren okuma yok sayılır.
pencere.addEventListener("close", () => { okumaNo++; });
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
    if (olay.target.dataset.saat === "asagi") bitisiAyarla(olay.target.closest(".satir"), true);
    // Sarı işaretli alan değiştirildiyse kontrol edilmiş sayılır.
    if (olay.target.classList.contains("emin-degil")) isaretiKaldir(olay.target);
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

// Takvimdeki tıklamalar: "⋯" butonu düzenleme formunu, bloğun kendisi dersin sağ panelini açar.
izgara.addEventListener("click", (olay) => {
    const tasiyici = olay.target.closest("[data-ders-id]");
    if (!tasiyici) return;
    const ders = dersler.find((d) => d.id === Number(tasiyici.dataset.dersId));
    if (!ders) return;
    if (olay.target.closest(".menu-dugmesi")) {
        dersFormunuAc(ders);
    } else {
        // Sınav bloğuysa panelde o kalemin satırı da vurgulanır.
        dersPaneliniAc(ders, tasiyici.dataset.kalemId ? Number(tasiyici.dataset.kalemId) : null);
    }
});

// ============================================================
// SAĞ PANEL
// Panel bir kapsayıcıdır: içinde aynı anda tek bir "görünüm" gösterilir.
// Şimdilik iki görünüm var: "bos" (ders seçili değil) ve "ders" (seçili dersin paneli).
// İleride başka görünümler (ör. genel GPA) eklenebilir.
// ============================================================

const yanPanel = document.getElementById("yan-panel");
const sekmeler = document.getElementById("sekmeler");
const hesapOzeti = document.getElementById("hesap-ozeti");
const kalemTablosu = document.getElementById("kalem-tablosu");
const puanHatasi = document.getElementById("puan-hatasi");
const notAlani = document.getElementById("ders-notlari");
const notDurumu = document.getElementById("not-durumu");
const bilgiIcerigi = document.getElementById("bilgi-icerigi");

let seciliDersId = null;       // panelde açık olan dersin kimliği (yoksa null)
let seciliSekme = "hesap";     // "hesap", "devamsizlik", "notlar" veya "bilgi"
let notZamanlayici = null;     // yazılan notun bekleyen otomatik kaydı

// Küçük yardımcı: bir HTML elemanı oluşturur.
function eleman(etiket, sinif, yazi) {
    const yeni = document.createElement(etiket);
    if (sinif) yeni.className = sinif;
    if (yazi != null) yeni.textContent = yazi;
    return yeni;
}

function seciliDers() {
    return dersler.find((ders) => ders.id === seciliDersId) || null;
}

function turBul(anahtar) {
    return AYARLAR.degerlendirmeTurleri.find((tur) => tur.anahtar === anahtar) || { ad: anahtar, den_hali: anahtar };
}

// Panelde sadece adı verilen görünümü gösterir.
function panelGorunumunuGoster(ad) {
    yanPanel.querySelectorAll(".panel-gorunumu").forEach((gorunum) => {
        gorunum.hidden = gorunum.dataset.gorunum !== ad;
    });
}

// Seçili dersin takvimdeki bütün bloklarını (ve şerit etiketlerini) çerçeveyle belli eder.
function seciliVurguyuGuncelle() {
    izgara.querySelectorAll("[data-ders-id]").forEach((blok) => {
        blok.classList.toggle("secili", Number(blok.dataset.dersId) === seciliDersId);
    });
}

// Dersin panelini açar. kalemId verilirse (sınav bloğuna tıklandıysa) o kalemin satırı vurgulanır.
function dersPaneliniAc(ders, kalemId = null) {
    const dersDegisti = ders.id !== seciliDersId;
    if (dersDegisti) {
        notKaydiniBitir();      // önceki dersin yazılmakta olan notu kaybolmasın
        seciliDersId = ders.id;
        seciliSekme = "hesap";
    }
    if (kalemId != null) seciliSekme = "hesap";
    dersPaneliniCiz(dersDegisti);
    seciliVurguyuGuncelle();
    if (kalemId != null) kalemSatiriniVurgula(kalemId);
}

function paneliKapat() {
    notKaydiniBitir();
    seciliDersId = null;
    panelGorunumunuGoster("bos");
    seciliVurguyuGuncelle();
}

// Dersler sunucudan yeniden yüklenince çağrılır: paneli yeni veriyle tazeler,
// seçili ders silinmişse paneli kapatır.
function paneliYenile() {
    if (seciliDersId === null) return;
    if (!seciliDers()) {
        clearTimeout(notZamanlayici);
        notZamanlayici = null;
        seciliDersId = null;
        panelGorunumunuGoster("bos");
        return;
    }
    dersPaneliniCiz(false);
}

function sekmeyiGoster(ad) {
    seciliSekme = ad;
    sekmeler.querySelectorAll("button").forEach((dugme) => {
        dugme.classList.toggle("secili", dugme.dataset.sekme === ad);
    });
    yanPanel.querySelectorAll(".sekme-icerigi").forEach((icerik) => {
        icerik.hidden = icerik.dataset.sekme !== ad;
    });
}

// Seçili dersin panelini baştan çizer.
// notlariYukle: not alanı da dersin kayıtlı notuyla doldurulsun mu? (Aynı ders tazelenirken
// doldurulmaz ki o sırada yazılmakta olan not ezilmesin.)
function dersPaneliniCiz(notlariYukle) {
    const ders = seciliDers();
    panelGorunumunuGoster("ders");

    document.getElementById("panel-renk").style.background = renkBul(ders.renk).kod;
    document.getElementById("panel-kod").textContent = ders.kod;
    const adYazisi = document.getElementById("panel-ad");
    adYazisi.textContent = ders.ad || "";
    adYazisi.hidden = !ders.ad;

    const kunye = [`Kredi ${ders.kredi}`, `Hedef ${hedefHarf(ders) ? ders.hedef_not : "—"}`];
    if (ders.devamsizlik_hakki != null) kunye.push(`Devamsızlık hakkı %${ders.devamsizlik_hakki}`);
    document.getElementById("panel-kunye").textContent = kunye.join(" · ");

    if (notlariYukle) {
        notAlani.value = ders.notlar || "";
        notDurumu.textContent = "";
    }
    sekmeyiGoster(seciliSekme);
    kalemTablosunuCiz(ders);
    hesabiCiz(ders);
    devamsizligiCiz(ders);
    bilgiyiCiz(ders);
}

// ---------- Sekme: Not hesabı ----------
// Bütün dersler mutlak notlandırma ile hesaplanır; harf ölçeği app.py'deki NOT_OLCEGI'nden gelir.
//
// Puan girişi kuralı (app.py: YUZ_UZERINDEN_TURLER):
//   Vize 1/2/3 ve Final : 0-100 üzerinden girilir, toplama katkısı = ağırlık × girilen / 100
//   Diğer bütün kalemler: 0 ile kalemin ağırlığı arasında doğrudan puan girilir, katkısı = girilen değer

// Bir harfin alt sınırını yuvarlama ayarına (app.py: ROUND_MODE) göre verir.
// "none": yuvarlama yok, puan >= alt sınır olmalı. "nearest": 89.5, 90 sayılır.
// Bütün harf karşılaştırmaları ve "gereken puan" hesapları bu eşiği kullanır.
function etkinEsik(altSinir) {
    return AYARLAR.roundMode === "nearest" ? altSinir - 0.5 : altSinir;
}

// Dersin hedef harfi (ölçekteki satırı). Seçilmemişse ya da hedef olamayacak bir değerse null.
function hedefHarf(ders) {
    return AYARLAR.notOlcegi.find((harf) => harf.harf === ders.hedef_not && harf.katsayi > 0) || null;
}

// Verilen ders puanının karşılık geldiği harf (50'nin altı F).
function harfSeviyesi(puan) {
    return AYARLAR.notOlcegi.find((harf) => puan >= etkinEsik(harf.alt_sinir))
        || AYARLAR.notOlcegi[AYARLAR.notOlcegi.length - 1];
}

// Ekranda en fazla tek ondalık; tam sayıysa ondalık gösterilmez (85.0 yerine 85).
// "En az" denilen değerler yukarı yuvarlanır ki yazılan puan gerçekten yetsin;
// toplamlar aşağı yuvarlanır ki olduğundan yüksek görünmesin. (1e6: küsurat hatalarını temizler.)
function yukariYuvarla(sayi) {
    return String(Math.ceil(Math.round(sayi * 1e6) / 1e5) / 10);
}

function asagiYuvarla(sayi) {
    return String(Math.floor(Math.round(sayi * 1e6) / 1e5) / 10);
}

// Sonuç kutusundaki sayılar: en fazla 2 ondalık, gereksiz sıfırlar atılır (77.50 -> 77.5, 81.00 -> 81).
// Toplam aşağı, "eksik puan" yukarı yuvarlanır (yukari = true) ki durum olduğundan iyi görünmesin.
function ikiOndalik(sayi, yukari = false) {
    const yuzKati = Math.round(sayi * 1e6) / 1e4;
    return String((yukari ? Math.ceil(yuzKati) : Math.floor(yuzKati)) / 100);
}

// Kalemin puanı 100 üzerinden mi giriliyor (vize, final)?
function yuzUzerindenMi(kalem) {
    return AYARLAR.yuzUzerindenTurler.includes(kalem.tur);
}

// Kalemin puan alanına girilebilecek en büyük değer: vize/finalde 100, diğerlerinde kalemin ağırlığı.
function puanSiniri(kalem) {
    return yuzUzerindenMi(kalem) ? 100 : kalem.agirlik;
}

// Kalemin toplam ders puanına katkısı. Puan girilmemişse null.
// Ağırlık sonradan girilmiş puanın altına indirildiyse katkı yeni ağırlıkla sınırlanır.
function kalemKatkisi(kalem) {
    if (kalem.alinan_puan == null) return null;
    if (yuzUzerindenMi(kalem)) return kalem.agirlik * kalem.alinan_puan / 100;
    return Math.min(kalem.alinan_puan, kalem.agirlik);
}

// Dersin not durumu: hesabın bütün ara değerleri burada, tek yerde hesaplanır.
// Ders puanı 100'e kırpılmaz; ekstra kalemlerden alınan puan doğrudan eklenir.
function notDurumunuHesapla(ders) {
    const durum = {
        kazanilan: 0,            // girilen kalemlerin katkıları toplamı (ekstra dahil)
        girilenVar: false,       // en az bir kaleme puan girilmiş mi
        kalanNormal: [],         // puanı girilmemiş normal kalemler
        kalanNormalPuan: 0,      // bunlardan alınabilecek en fazla puan (ağırlıkları toplamı)
        kalanEkstraPuan: 0,      // puanı girilmemiş ekstra kalemlerin ağırlıkları toplamı
        normalToplam: 0,         // normal kalemlerin ağırlık toplamı (%100'den az ya da çok olabilir)
    };
    for (const kalem of ders.degerlendirmeler) {
        if (!kalem.ekstra_puan) durum.normalToplam += kalem.agirlik;
        const katki = kalemKatkisi(kalem);
        if (katki !== null) {
            durum.kazanilan += katki;
            durum.girilenVar = true;
        } else if (kalem.ekstra_puan) {
            durum.kalanEkstraPuan += kalem.agirlik;
        } else {
            durum.kalanNormal.push(kalem);
            durum.kalanNormalPuan += kalem.agirlik;
        }
    }
    return durum;
}

// Sonuç kutusunun alt notunu hazırlar: { baslik, ek: [satırlar], duzenle }
// Hedefe ulaşıldıysa not yoktur, null döner.
function sonucMesaji(ders, durum) {
    if (ders.degerlendirmeler.length === 0) {
        return { baslik: "Bu derse değerlendirme kalemi eklenmemiş.", ek: ["Kalemleri “Düzenle” ile ekleyebilirsin."], duzenle: true };
    }
    const hedef = hedefHarf(ders);
    if (!hedef) {
        return { baslik: "Bu dersin hedef harf notu seçilmemiş.", ek: ["Hedefini “Düzenle” ile seç."], duzenle: true };
    }
    // Hedefe ulaşmak için daha kaç puan gerekiyor?
    const gereken = etkinEsik(hedef.alt_sinir) - durum.kazanilan;
    if (gereken <= 0) return null;

    // Girilecek normal kalem kalmadı: hedefe kaç puan eksik kaldığı söylenir.
    if (durum.kalanNormal.length === 0) {
        const ek = [];
        if (durum.kalanEkstraPuan > 0) {
            ek.push(gereken <= durum.kalanEkstraPuan
                ? "Ekstra puanlarla ulaşılabilir."
                : "Ekstra puanlarla da ulaşılamıyor.");
        }
        return { baslik: `Hedef ${hedef.harf} için ${ikiOndalik(gereken, true)} puan eksik.`, ek };
    }

    // Kalan normal kalemlerin hepsinden tam puan alınsa bile yetmiyor.
    if (gereken > durum.kalanNormalPuan) {
        if (durum.kalanEkstraPuan > 0 && gereken <= durum.kalanNormalPuan + durum.kalanEkstraPuan) {
            return {
                baslik: "Ekstra olmadan bu hedefe ulaşmak mümkün görünmüyor.",
                ek: [`Ekstra puanları da alırsan kalan kalemlerden toplam en az ${yukariYuvarla(gereken - durum.kalanEkstraPuan)} puan yeterli.`],
            };
        }
        return { baslik: "Bu hedefe ulaşmak mümkün görünmüyor." };
    }

    // Tek kalem kaldı.
    if (durum.kalanNormal.length === 1) {
        const kalem = durum.kalanNormal[0];
        const tur = turBul(kalem.tur);
        if (yuzUzerindenMi(kalem)) {
            // Vize/final: gereken puan 100 üzerinden söylenir.
            return { baslik: `${tur.den_hali} en az ${yukariYuvarla(gereken / kalem.agirlik * 100)} almalısın.` };
        }
        return { baslik: `${tur.ad} için en az ${yukariYuvarla(gereken)} puan gerekiyor (${kalem.agirlik} üzerinden).` };
    }

    // Birden fazla kalem kaldı: toplam puan olarak söylenir.
    return {
        baslik: `Kalan kalemlerden toplam en az ${yukariYuvarla(gereken)} puan almalısın.`,
        ek: [
            `Alınabilecek en fazla: ${asagiYuvarla(durum.kalanNormalPuan)} puan`,
            durum.kalanNormal.map((kalem) => `${turBul(kalem.tur).ad} %${kalem.agirlik}`).join(", "),
        ],
    };
}

// Puan alanına yazılanı sayıya çevirir. Nokta da virgül de kabul edilir ("7,7" = 7.7),
// en fazla 2 ondalık basamak. Boşsa null (henüz alınmadı), geçersizse NaN döner.
function puaniCoz(yazi) {
    yazi = yazi.trim();
    if (yazi === "") return null;
    if (!/^\d+([.,]\d{1,2})?$/.test(yazi)) return NaN;
    return Number(yazi.replace(",", "."));
}

// Kalem listesi: her satırda solda kalem (türü, küçük gri ağırlığı, varsa "ekstra" etiketi),
// sağda puan alanı ve yanında girilebilecek en büyük değer ("/ 100" ya da "/ 10").
function kalemTablosunuCiz(ders) {
    kalemTablosu.replaceChildren();
    mesajGoster(puanHatasi, "");
    kalemTablosu.hidden = ders.degerlendirmeler.length === 0;
    if (kalemTablosu.hidden) return;

    const govde = kalemTablosu.createTBody();
    for (const kalem of ders.degerlendirmeler) {
        const satir = govde.insertRow();
        satir.dataset.kalemId = kalem.id;

        const adHucresi = satir.insertCell();
        adHucresi.textContent = turBul(kalem.tur).ad;
        adHucresi.appendChild(eleman("span", "kalem-agirligi", `%${kalem.agirlik}`));
        if (kalem.ekstra_puan) adHucresi.appendChild(eleman("span", "ekstra-etiketi", "ekstra"));

        const sinir = puanSiniri(kalem);
        const girdi = eleman("input");
        girdi.type = "text";
        girdi.inputMode = "decimal";   // telefonda sayı klavyesi; tarayıcının artır/azalt okları yok
        girdi.autocomplete = "off";
        girdi.placeholder = "—";
        girdi.value = kalem.alinan_puan ?? "";
        girdi.setAttribute("aria-label", `${turBul(kalem.tur).ad}: aldığım puan (${sinir} üzerinden)`);
        // Ağırlık sonradan girilmiş puanın altına indirildiyse alan kırmızı görünür.
        girdi.classList.toggle("eksik", kalem.alinan_puan != null && kalem.alinan_puan > sinir);
        // "change": değer değiştiyse alandan çıkınca (ya da Enter'a basınca) çalışır.
        girdi.addEventListener("change", () => puaniKaydet(kalem.id, girdi));

        const puanHucresi = satir.insertCell();
        puanHucresi.className = "sayi";
        puanHucresi.append(girdi, eleman("span", "puan-siniri", `/ ${sinir}`));
    }
}

// Girilen puanı kontrol edip kaydeder (boş = henüz alınmadı), ardından hesabı yeniler.
// Geçersiz değer (harf, negatif, sınırın üstü, 2'den fazla ondalık) kaydedilmez, alan kırmızı olur.
async function puaniKaydet(kalemId, girdi) {
    const kalem = seciliDers()?.degerlendirmeler.find((k) => k.id === kalemId);
    if (!kalem) return;
    const sinir = puanSiniri(kalem);
    const puan = puaniCoz(girdi.value);
    const gecersiz = puan !== null && !(puan >= 0 && puan <= sinir);
    girdi.classList.toggle("eksik", gecersiz);
    if (gecersiz) {
        mesajGoster(puanHatasi, `${turBul(kalem.tur).ad}: puan 0 ile ${sinir} arasında bir sayı olmalı (en fazla 2 ondalık). Kaydedilmedi.`);
        return;
    }
    try {
        await istekGonder("PUT", `/api/degerlendirmeler/${kalemId}/puan`, { alinan_puan: puan });
    } catch (hata) {
        girdi.classList.add("eksik");
        mesajGoster(puanHatasi, hata.message);
        return;
    }
    mesajGoster(puanHatasi, "");
    // Kayıt başarılı: eldeki veriyi güncelle, alanı sade biçimde göster ("7,7" -> "7.7") ve sonucu
    // yeniden hesapla (liste yeniden çizilmez, böylece bir sonraki alana geçmiş imleç kaybolmaz).
    kalem.alinan_puan = puan;
    girdi.value = puan ?? "";
    if (seciliDers()) hesabiCiz(seciliDers());
}

// Not hesabının sonucunu çizer: tek bir sonuç kutusu ve (gerekirse) altında küçük bir not.
// Kutu: ana yazı "<toplam> puan · <harf>"; hedefe ulaşıldıysa yeşil, ulaşılmadıysa sarı ve
// altında küçük not; hiç puan girilmediyse nötr gri. Renkler stil.css'te (--sonuc-...).
function hesabiCiz(ders) {
    const durum = notDurumunuHesapla(ders);
    hesapOzeti.replaceChildren();

    const not = sonucMesaji(ders, durum);   // null: hedefe ulaşıldı
    const kutu = eleman("div", "hesap-sonucu");

    if (ders.degerlendirmeler.length === 0) {
        // Kalem yok: nötr kutuda sadece mesaj ve Düzenle butonu.
        kutu.appendChild(eleman("strong", "", not.baslik));
        for (const yazi of not.ek) kutu.appendChild(eleman("p", "", yazi));
    } else {
        // Renk: puan girilmişse ve hedef belliyse yeşil (ulaşıldı) ya da sarı (ulaşılmadı).
        let renk = null;
        if (durum.girilenVar && hedefHarf(ders)) renk = not === null ? "yesil" : "sari";
        if (renk) kutu.classList.add(renk);

        const anaYazi = eleman("strong", "ana-yazi");
        // Anlam sadece renge bağlı kalmasın diye küçük bir simge: yeşilde ✓, sarıda !
        if (renk) {
            const simge = eleman("span", "durum-simgesi", renk === "yesil" ? "✓" : "!");
            simge.setAttribute("role", "img");
            simge.setAttribute("aria-label", renk === "yesil" ? "Hedefe ulaşıldı" : "Hedefe ulaşılmadı");
            anaYazi.appendChild(simge);
        }
        // Harf, yuvarlanmamış toplama göre bulunur.
        anaYazi.appendChild(eleman("span", "", durum.girilenVar
            ? `${ikiOndalik(durum.kazanilan)} puan · ${harfSeviyesi(durum.kazanilan).harf}`
            : "Henüz puan girilmedi"));
        if (durum.girilenVar && durum.kalanNormal.length > 0) {
            anaYazi.appendChild(eleman("small", "", "(kalan kalemler hariç)"));
        }
        kutu.appendChild(anaYazi);

        // Alt not: hedefe ulaşılmadıysa (ya da hiç puan girilmediyse) ne gerektiği.
        if (not) {
            for (const yazi of [not.baslik, ...(not.ek || [])]) kutu.appendChild(eleman("p", "", yazi));
        }
    }
    if (not?.duzenle) {
        const dugme = eleman("button", "dugme", "Düzenle");
        dugme.type = "button";
        dugme.addEventListener("click", () => dersFormunuAc(ders));
        kutu.appendChild(dugme);
    }
    hesapOzeti.appendChild(kutu);

    if (ders.degerlendirmeler.length > 0 && durum.normalToplam < 100) {
        hesapOzeti.appendChild(eleman("p", "kucuk-not",
            `Değerlendirme toplamı %${asagiYuvarla(durum.normalToplam)}, eksik kalem olabilir.`));
    }
}

// Sınav bloğundan gelindiğinde o kalemin satırını kısa süre vurgular.
function kalemSatiriniVurgula(kalemId) {
    const satir = kalemTablosu.querySelector(`tr[data-kalem-id="${kalemId}"]`);
    if (!satir) return;
    satir.classList.remove("vurgulu");
    void satir.offsetWidth;   // animasyon baştan başlasın diye
    satir.classList.add("vurgulu");
    satir.scrollIntoView?.({ block: "nearest" });
    setTimeout(() => satir.classList.remove("vurgulu"), 1600);
}

// ---------- Sekme: Notlar ----------
// Yazmayı bıraktıktan yaklaşık 1 saniye sonra kendiliğinden kaydedilir.

async function notlariKaydet() {
    clearTimeout(notZamanlayici);
    notZamanlayici = null;
    const ders = seciliDers();
    if (!ders) return;
    const dersId = ders.id;
    ders.notlar = notAlani.value;   // başka derse geçip geri dönünce de görünsün
    let basarili = false;
    try {
        // keepalive: sayfa kapanırken gönderilen son kayıt da yerine ulaşsın.
        const yanit = await fetch(`/api/dersler/${dersId}/notlar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notlar: ders.notlar }),
            keepalive: true,
        });
        basarili = yanit.ok;
    } catch {
        basarili = false;
    }
    // Bu arada başka derse geçildiyse ya da yeniden yazılmaya başlandıysa göstergeye dokunma.
    if (seciliDersId === dersId && notZamanlayici === null) {
        notDurumu.textContent = basarili ? "Kaydedildi" : "Kaydedilemedi, sunucu çalışıyor mu?";
    }
}

// Bekleyen bir not kaydı varsa hemen yapar (ders değişirken, panel ya da sayfa kapanırken).
function notKaydiniBitir() {
    if (notZamanlayici !== null) notlariKaydet();
}

notAlani.addEventListener("input", () => {
    notDurumu.textContent = "Yazılıyor...";
    clearTimeout(notZamanlayici);
    notZamanlayici = setTimeout(notlariKaydet, 1000);
});
window.addEventListener("pagehide", notKaydiniBitir);

// ---------- Sekme: Bilgi (salt okunur özet) ----------

// "2026-11-15" -> "15.11.2026"
function tarihiGoster(tarih) {
    return tarih.split("-").reverse().join(".");
}

function bilgiyiCiz(ders) {
    bilgiIcerigi.replaceChildren();

    function bolum(baslik, satirlar) {
        bilgiIcerigi.appendChild(eleman("h3", "", baslik));
        const liste = eleman("ul");
        for (const yazi of satirlar) liste.appendChild(eleman("li", "", yazi));
        bilgiIcerigi.appendChild(liste);
    }

    bolum("Oturumlar", ders.oturumlar.map((oturum) => {
        const parcalar = [`${AYARLAR.gunler[oturum.gun]} ${oturum.baslangic}-${oturum.bitis}`, oturum.derslik];
        if (oturum.tur) parcalar.push(oturum.tur);
        return parcalar.join(" · ");
    }));

    bolum("Değerlendirme kalemleri", ders.degerlendirmeler.length === 0 ? ["Kalem eklenmemiş."]
        : ders.degerlendirmeler.map((kalem) => {
            const parcalar = [turBul(kalem.tur).ad, `%${kalem.agirlik}`];
            if (kalem.tarih) parcalar.push(tarihiGoster(kalem.tarih));
            if (kalem.saat) parcalar.push(kalem.saat + (kalem.bitis_saat ? `-${kalem.bitis_saat}` : ""));
            if (kalem.ekstra_puan) parcalar.push("ekstra");
            return parcalar.join(" · ");
        }));

    bolum("AKTS", [ders.akts != null ? String(ders.akts) : "—"]);
}

// ---------- Panel olayları ----------

document.getElementById("panel-kapat").addEventListener("click", paneliKapat);
document.getElementById("bilgi-duzenle").addEventListener("click", () => {
    if (seciliDers()) dersFormunuAc(seciliDers());
});
sekmeler.addEventListener("click", (olay) => {
    const dugme = olay.target.closest("button[data-sekme]");
    if (dugme) sekmeyiGoster(dugme.dataset.sekme);
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
