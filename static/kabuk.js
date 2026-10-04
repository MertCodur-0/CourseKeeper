// Uygulama kabuğu: tema, pencerelerin açılıp kapanması, sol kenar çubuğu, üst çubuk
// (kullanıcı alanı), karşılama satırı, profil ve dar ekrandaki çekmeceler.
// Diğer dosyalardan sonra yüklenir; oradaki fonksiyonları kullanır (secimEkraniniAc,
// yoklamaPenceresiniAc, donemEkraniniAc, donemEkraniniKapat, donemSekmesiniGoster,
// yoklamaVerisi, gunNumarasi, GUN_ADLARI, AY_ADLARI).

// Tarayıcıda saklanan küçük arayüz tercihleri. Saklama alanına ulaşılamazsa (gizli pencere vb.)
// varsayılan kullanılır; bu yüzden her erişim try/catch içindedir.
function tercihOku(anahtar) {
    try {
        return localStorage.getItem(anahtar);
    } catch {
        return null;
    }
}

function tercihYaz(anahtar, deger) {
    try {
        localStorage.setItem(anahtar, deger);
    } catch {
        // Saklanamadı: değer sadece bu açılış için geçerli olur.
    }
}

// ============================================================
// TEMA: Sistem / Açık / Koyu (varsayılan Koyu)
// Sayfa açılırken temayı index.html'in başındaki betik uygular; buradaki kod Ayarlar'daki
// seçimi ve sol çubuktaki tema anahtarını yönetir.
// ============================================================

const TEMA_TERCIHI = "derstakip.tema";
const TEMA_SECENEKLERI = ["sistem", "acik", "koyu"];
const VARSAYILAN_TEMA = "koyu";
const sistemKoyuMu = window.matchMedia("(prefers-color-scheme: dark)");

function temaSecimi() {
    const kayitli = tercihOku(TEMA_TERCIHI);
    return TEMA_SECENEKLERI.includes(kayitli) ? kayitli : VARSAYILAN_TEMA;
}

// Seçimi sayfaya uygular: <html data-tema="acik|koyu">. Renklerin hepsi stil.css'te bu değere bağlıdır.
function temayiUygula(secim) {
    const koyu = secim === "koyu" || (secim === "sistem" && sistemKoyuMu.matches);
    document.documentElement.dataset.tema = koyu ? "koyu" : "acik";
    document.querySelectorAll("#tema-secimi button").forEach((dugme) => {
        dugme.setAttribute("aria-checked", String(dugme.dataset.temaSecimi === secim));
    });
    // Sol çubuktaki anahtarın yazısı geçilecek temayı söyler.
    const anahtarYazisi = koyu ? "Açık mod" : "Koyu mod";
    const anahtar = document.getElementById("tema-anahtari");
    document.getElementById("tema-anahtari-yazisi").textContent = anahtarYazisi;
    anahtar.dataset.ipucu = anahtarYazisi;
    anahtar.setAttribute("aria-label", anahtarYazisi);
}

function temayiSec(secim) {
    tercihYaz(TEMA_TERCIHI, secim);
    temayiUygula(secim);
}

document.getElementById("tema-secimi").addEventListener("click", (olay) => {
    const dugme = olay.target.closest("button[data-tema-secimi]");
    if (dugme) temayiSec(dugme.dataset.temaSecimi);
});
// Anahtar: o an görünen temanın tersine geçer ve tercihi buna çevirir.
document.getElementById("tema-anahtari").addEventListener("click", () => {
    temayiSec(document.documentElement.dataset.tema === "koyu" ? "acik" : "koyu");
});
// "Sistem" seçiliyken Mac'in görünümü değişirse sayfa anında uyar.
sistemKoyuMu.addEventListener("change", () => {
    if (temaSecimi() === "sistem") temayiUygula("sistem");
});
temayiUygula(temaSecimi());

// ============================================================
// PENCERELER
// Pencereler tarayıcının "kipli" (modal) açılışıyla değil, sıradan açılışla gösterilir; çünkü
// kipli açılış sayfanın geri kalanını (sol çubuk dahil) tıklanamaz yapar. Arkayı karartan perde,
// Esc ile kapatma ve arkadaki içeriğin kilitlenmesi burada elle yapılır.
// ============================================================

const cubuk = document.getElementById("cubuk");
const icerik = document.getElementById("icerik");
const perde = document.getElementById("perde");
const ustPerde = document.getElementById("ust-perde");
const yoklamaPenceresiEl = document.getElementById("yoklama-penceresi");
const dersPenceresiEl = document.getElementById("ders-penceresi");
const donemPenceresiEl = document.getElementById("donem-penceresi");
const ayarlarPenceresi = document.getElementById("ayarlar-penceresi");
const yardimPenceresi = document.getElementById("yardim-penceresi");
const ANA_PENCERELER = [yoklamaPenceresiEl, dersPenceresiEl, donemPenceresiEl, ayarlarPenceresi, yardimPenceresi];
let ayarlarBolumu = "ayarlar";   // Ayarlar penceresi hangi bölümde açıldı: "ayarlar", "konum" ya da "profil"

// O an açık olan ana pencere (yoksa null).
function acikAnaPencere() {
    return ANA_PENCERELER.find((pencere) => pencere.open) || null;
}

// Bir pencerenin üstünde açılmış küçük pencere (ör. "Akademik takvimden doldur"), yoksa null.
function acikUstPencere() {
    return document.querySelector("dialog.ust-pencere[open]");
}

// Sol çubukta o an aktif olan öğe: pencere yoksa "takvim"; varsa o pencerenin öğesi.
// Dönem ekranı açıkken açık sekmeye göre "akademik" ya da "gpa".
function aktifOge() {
    const acik = acikAnaPencere();
    if (acik === yoklamaPenceresiEl) return "yoklama";
    if (acik === dersPenceresiEl) return "ders";
    if (acik === ayarlarPenceresi) return ayarlarBolumu === "profil" ? "profil" : "ayarlar";
    if (acik === yardimPenceresi) return "yardim";
    if (acik === donemPenceresiEl) {
        return document.querySelector("#donem-sekmeleri .secili")?.dataset.sekme === "gpa" ? "gpa" : "akademik";
    }
    return "takvim";
}

// Bir pencereyi açar. Bütün pencereler bununla açılır.
function pencereyiAc(pencere) {
    if (!pencere.open) pencere.show();
    pencereDurumunuGuncelle();
}

// Pencere açılıp kapandıkça: perdeleri, arkadaki içeriğin kilidini ve sol çubuktaki aktif öğeyi günceller.
function pencereDurumunuGuncelle() {
    const acik = acikAnaPencere();
    perde.hidden = acik === null;
    ustPerde.hidden = acikUstPencere() === null;
    // Pencere açıkken arkadaki içerik tıklanamaz ve klavyeyle gezilemez (sol çubuk hariç).
    icerik.inert = acik !== null;
    const aktif = aktifOge();
    cubuk.querySelectorAll("[data-oge]").forEach((oge) => {
        if (oge.dataset.oge === aktif) oge.setAttribute("aria-current", "page");
        else oge.removeAttribute("aria-current");
    });
}

// Açık pencereyi kapatır. Kapandıysa (ya da zaten açık pencere yoksa) true döner.
// Dönem ekranında kaydedilmemiş değişiklik varsa mevcut onay sorulur; vazgeçilirse false döner.
function acikPencereyiKapat() {
    acikUstPencere()?.close();
    const acik = acikAnaPencere();
    if (!acik) return true;
    if (acik === donemPenceresiEl) return donemEkraniniKapat();
    acik.close();
    return true;
}

document.querySelectorAll("dialog").forEach((pencere) => {
    pencere.addEventListener("close", pencereDurumunuGuncelle);
});

// Pencerenin dışına (perdeye) tıklanınca kapanır. Ders formu hariç: yanlışlıkla dışına tıklayınca
// doldurulan form kaybolmasın (o, × ya da Vazgeç ile kapanır).
perde.addEventListener("click", () => {
    const acik = acikAnaPencere();
    if (acik && acik !== dersPenceresiEl) acikPencereyiKapat();
});
ustPerde.addEventListener("click", () => acikUstPencere()?.close());

// ============================================================
// AYARLAR PENCERESİ ve PROFİL
// ============================================================

const AD_TERCIHI = "derstakip.ad";
const profilAdi = document.getElementById("profil-adi");

// Kullanıcının kaydettiği ad (yoksa boş).
function kullaniciAdi() {
    return (tercihOku(AD_TERCIHI) || "").trim().slice(0, 30);
}

// Ayarlar penceresini açar. bolum "profil" ise ad alanına, "konum" ise şehir kutusuna odaklanır.
function ayarlarPenceresiniAc(bolum) {
    ayarlarBolumu = bolum;
    profilAdi.value = kullaniciAdi();
    document.getElementById("profil-durumu").textContent = "";
    konumBolumunuCiz();
    pencereyiAc(ayarlarPenceresi);
    if (bolum === "profil" || bolum === "konum") {
        document.getElementById(`ayar-${bolum}`).scrollIntoView?.({ block: "nearest" });
        (bolum === "profil" ? profilAdi : document.getElementById("sehir-kutusu")).focus();
    }
}

document.getElementById("ayarlar-kapat").addEventListener("click", () => ayarlarPenceresi.close());
document.getElementById("yardim-kapat").addEventListener("click", () => yardimPenceresi.close());
document.getElementById("profil-formu").addEventListener("submit", (olay) => {
    olay.preventDefault();
    tercihYaz(AD_TERCIHI, profilAdi.value.trim().slice(0, 30));
    document.getElementById("profil-durumu").textContent = "Kaydedildi";
    ustBilgiyiGuncelle();   // karşılama ve kullanıcı alanı yeni adı göstersin
});

// ============================================================
// SOL KENAR ÇUBUĞU
// Öğeler: ders (Ders ekle), takvim, yoklama, akademik, gpa, ayarlar, bildirimler, yardim, profil. Yeni bir ana eylem
// eklemek için: index.html'e bir öğe, aktifOge()'ye penceresi, OGE_EYLEMLERI'ne açan fonksiyon.
// ============================================================

const CUBUK_TERCIHI = "derstakip.cubuk";   // "dar" ya da "acik" (varsayılan açık)
const daraltDugmesi = document.getElementById("cubuk-daralt");
const darEkran = window.matchMedia("(max-width: 899px)");      // sol çubuk çekmece olur
const panelsizEkran = window.matchMedia("(max-width: 1099px)"); // sağ panel çekmece olur

const OGE_EYLEMLERI = {
    ders: () => secimEkraniniAc(),
    yoklama: () => yoklamaPenceresiniAc(),
    akademik: () => donemEkraniniAc("takvim"),
    gpa: () => donemEkraniniAc("gpa"),
    ayarlar: () => ayarlarPenceresiniAc("ayarlar"),
    profil: () => ayarlarPenceresiniAc("profil"),
    konum: () => ayarlarPenceresiniAc("konum"),   // sol çubukta öğesi yok; hava durumu kartı açar
    yardim: () => pencereyiAc(yardimPenceresi),
};

// Çubuğu daraltır ya da genişletir; durumu saklar. Takvim sütunları yeni genişliğe kendiliğinden uyar.
function cubuguAyarla(dar) {
    if (dar) document.documentElement.dataset.cubuk = "dar";
    else delete document.documentElement.dataset.cubuk;
    tercihYaz(CUBUK_TERCIHI, dar ? "dar" : "acik");
    cubukDugmesiniGuncelle();
}

function cubukDugmesiniGuncelle() {
    const dar = document.documentElement.dataset.cubuk === "dar";
    daraltDugmesi.setAttribute("aria-expanded", String(!dar));
    const etiket = dar ? "Çubuğu genişlet" : "Çubuğu daralt";
    daraltDugmesi.setAttribute("aria-label", etiket);
    daraltDugmesi.title = `${etiket} (⌘B)`;
}

daraltDugmesi.addEventListener("click", () => {
    cubuguAyarla(document.documentElement.dataset.cubuk !== "dar");
});
cubukDugmesiniGuncelle();

// Bir öğeye basılınca: açık pencere varsa önce o kapanır (kaydedilmemiş değişiklikte onay sorulur;
// vazgeçilirse hiçbir şey değişmez). "Takvim" ya da zaten açık olan pencerenin öğesi sadece kapatır.
function cubukOgesineBasildi(ad) {
    // "Bildirimler" bir pencere değil: üst çubuktaki zilin altındaki kartı açar/kapatır.
    // (Açık pencere varsa önce o kapanır; çünkü kart, pencere açıkken kilitli olan içerik alanındadır.)
    if (ad === "bildirimler") {
        if (acikPencereyiKapat()) bildirimKartiniAcKapat();
        return;
    }
    const aktif = aktifOge();
    // Aynı pencerenin diğer bölümü: pencere kapanmadan sekme/bölüm değişir.
    if (donemPenceresiEl.open && (ad === "akademik" || ad === "gpa") && ad !== aktif) {
        donemSekmesiniGoster(ad === "gpa" ? "gpa" : "takvim");
        return;
    }
    if (ayarlarPenceresi.open && (ad === "ayarlar" || ad === "profil") && ad !== aktif) {
        ayarlarPenceresiniAc(ad);
        return;
    }
    if (!acikPencereyiKapat()) return;
    if (ad === "takvim" || ad === aktif) return;
    OGE_EYLEMLERI[ad]();
}

cubuk.addEventListener("click", (olay) => {
    const oge = olay.target.closest("[data-oge]");
    if (!oge) return;
    cekmeceyiKapat();   // dar ekranda öğe seçilince menü çekmecesi kapanır
    cubukOgesineBasildi(oge.dataset.oge);
});
document.getElementById("kullanici-alani").addEventListener("click", () => cubukOgesineBasildi("profil"));

// ============================================================
// DAR EKRAN: sol menü çekmecesi (< 900px) ve sağ panel çekmecesi (< 1100px)
// ============================================================

const menuAcici = document.getElementById("menu-acici");
const panelDugmesi = document.getElementById("panel-dugmesi");
const cekmecePerdesi = document.getElementById("cekmece-perdesi");

function cekmeceDurumunuGuncelle() {
    const kok = document.documentElement.dataset;
    cekmecePerdesi.hidden = kok.cekmece !== "acik" && kok.panel !== "acik";
    menuAcici.setAttribute("aria-expanded", String(kok.cekmece === "acik"));
    panelDugmesi.setAttribute("aria-expanded", String(kok.panel === "acik"));
}

function cekmeceyiAc() {
    if (!darEkran.matches) return;
    document.documentElement.dataset.cekmece = "acik";
    cekmeceDurumunuGuncelle();
    cubuk.querySelector(".cubuk-ogesi").focus();   // odak çekmeceye geçer
}

function cekmeceyiKapat() {
    if (document.documentElement.dataset.cekmece !== "acik") return;
    delete document.documentElement.dataset.cekmece;
    cekmeceDurumunuGuncelle();
}

// Sağ panel çekmecesi: sadece dar ekranda (geniş ekranda panel hep görünür, bunlar etkisizdir).
function panelCekmecesiniAc() {
    if (!panelsizEkran.matches) return;
    document.documentElement.dataset.panel = "acik";
    cekmeceDurumunuGuncelle();
}

function panelCekmecesiniKapat() {
    if (document.documentElement.dataset.panel !== "acik") return;
    delete document.documentElement.dataset.panel;
    cekmeceDurumunuGuncelle();
}

menuAcici.addEventListener("click", cekmeceyiAc);
panelDugmesi.addEventListener("click", () => {
    if (document.documentElement.dataset.panel === "acik") panelCekmecesiniKapat();
    else panelCekmecesiniAc();
});
cekmecePerdesi.addEventListener("click", () => {
    cekmeceyiKapat();
    panelCekmecesiniKapat();
});
// Ekran genişleyince açık kalmış çekmeceler kapanır.
darEkran.addEventListener("change", cekmeceyiKapat);
panelsizEkran.addEventListener("change", panelCekmecesiniKapat);

// ============================================================
// KLAVYE: Esc ve Cmd/Ctrl+B
// ============================================================

document.addEventListener("keydown", (olay) => {
    // Cmd+B / Ctrl+B: sol çubuğu daraltır ya da genişletir (dar ekranda çekmece modunda çalışmaz).
    if ((olay.metaKey || olay.ctrlKey) && !olay.altKey && !olay.shiftKey && olay.key.toLowerCase() === "b") {
        olay.preventDefault();
        if (!darEkran.matches) cubuguAyarla(document.documentElement.dataset.cubuk !== "dar");
        return;
    }
    if (olay.key !== "Escape") return;
    // Esc sırayla: bildirim kartı, açık çekmece, üstteki küçük pencere, açık ana pencere.
    const kok = document.documentElement.dataset;
    if (bildirimKartiniKapat()) {
        // kapandı
    } else if (kok.cekmece === "acik" || kok.panel === "acik") {
        cekmeceyiKapat();
        panelCekmecesiniKapat();
    } else if (acikUstPencere()) {
        acikUstPencere().close();
    } else if (acikAnaPencere()) {
        acikPencereyiKapat();
    } else {
        return;
    }
    olay.preventDefault();
});

// ============================================================
// ÜST ÇUBUK ve KARŞILAMA
// ============================================================

// "Ekim'de", "Kasım'da" ... (ay adına gelen ek, aya göre değişir)
const AY_BULUNMA_EKLERI = ["ta", "ta", "ta", "da", "ta", "da", "da", "ta", "de", "de", "da", "ta"];

// Saate göre selam: 05-12 Günaydın, 12-18 İyi günler, 18-23 İyi akşamlar, 23-05 İyi geceler.
function selam(saat) {
    if (saat >= 5 && saat < 12) return "Günaydın";
    if (saat >= 12 && saat < 18) return "İyi günler";
    if (saat >= 18 && saat < 23) return "İyi akşamlar";
    return "İyi geceler";
}

// Dönem bilgisi: { yazi, nokta }. Hafta = dönemin ilk gününden bugüne geçen hafta + 1.
function donemBilgisi(bugun) {
    const donem = yoklamaVerisi.donem;
    if (!donem) return { yazi: "Dönem tanımlı değil", nokta: "sari" };
    if (bugun < donem.baslangic) {
        const [, ay, gun] = donem.baslangic.split("-").map(Number);
        return { yazi: `Dönem ${gun} ${AY_ADLARI[ay - 1]}'${AY_BULUNMA_EKLERI[ay - 1]} başlıyor`, nokta: "" };
    }
    if (bugun > donem.bitis) return { yazi: "Dönem bitti", nokta: "" };
    const hafta = Math.floor((gunNumarasi(bugun) - gunNumarasi(donem.baslangic)) / 7) + 1;
    return { yazi: (donem.ad ? `${donem.ad} · ` : "") + `${hafta}. hafta`, nokta: "yesil" };
}

// Karşılama satırını ve üst çubuktaki kullanıcı alanını yazar.
// "Şimdi" sunucudan gelir (Mac'in yerel saati); henüz gelmediyse tarayıcının saati kullanılır.
function ustBilgiyiGuncelle() {
    const simdi = yoklamaVerisi.simdi || (() => {
        const t = new Date();
        const iki = (sayi) => String(sayi).padStart(2, "0");
        return `${t.getFullYear()}-${iki(t.getMonth() + 1)}-${iki(t.getDate())}T${iki(t.getHours())}:${iki(t.getMinutes())}`;
    })();
    const bugun = simdi.slice(0, 10);
    const [yil, ay, gun] = bugun.split("-").map(Number);
    const ad = kullaniciAdi();

    document.getElementById("karsilama-yazisi").textContent = selam(Number(simdi.slice(11, 13))) + (ad ? `, ${ad}` : "");
    const haftaninGunuSirasi = (new Date(gunNumarasi(bugun) * 86400000).getUTCDay() + 6) % 7;
    document.getElementById("bugunun-tarihi").textContent = `${GUN_ADLARI[haftaninGunuSirasi]}, ${gun} ${AY_ADLARI[ay - 1]} ${yil}`;

    // Kullanıcı alanı: avatar (adın ilk harfi; ad yoksa kişi simgesi kalır), ad ve dönem bilgisi.
    const avatar = document.getElementById("avatar");
    if (!avatar.dataset.simge) avatar.dataset.simge = avatar.innerHTML;   // kişi simgesini sakla
    if (ad) avatar.textContent = ad[0].toLocaleUpperCase("tr");
    else avatar.innerHTML = avatar.dataset.simge;
    const adYazisi = document.getElementById("kullanici-adi");
    adYazisi.textContent = ad;
    adYazisi.hidden = ad === "";
    const bilgi = donemBilgisi(bugun);
    document.getElementById("donem-bilgisi").textContent = bilgi.yazi;
    document.getElementById("donem-noktasi").className = `durum-noktasi ${bilgi.nokta}`.trim();
}

// Yoklama verisi her yenilendiğinde çağrılır: rozeti, karşılamayı ve dönem bilgisini günceller.
// Rozet: bekleyen oturum sayısı (0 ise rozet yok, 99'dan fazlaysa "99+").
function kabukBilgisiniGuncelle(bekleyenSayisi) {
    const rozet = document.getElementById("yoklama-rozeti");
    rozet.hidden = bekleyenSayisi === 0;
    rozet.textContent = bekleyenSayisi > 99 ? "99+" : String(bekleyenSayisi);
    const oge = cubuk.querySelector('[data-oge="yoklama"]');
    const etiket = bekleyenSayisi > 0 ? `Yoklama (${bekleyenSayisi} bekliyor)` : "Yoklama";
    oge.dataset.ipucu = etiket;
    oge.setAttribute("aria-label", etiket);
    ustBilgiyiGuncelle();
}

pencereDurumunuGuncelle();
cekmeceDurumunuGuncelle();
ustBilgiyiGuncelle();
