// Alt çubuk (dock), pencerelerin açılıp kapanması ve tema seçimi.
// Diğer dosyalardan sonra yüklenir; oradaki fonksiyonları kullanır (secimEkraniniAc,
// yoklamaPenceresiniAc, donemEkraniniAc, donemEkraniniKapat).

// ============================================================
// TEMA: Sistem / Açık / Koyu (varsayılan Koyu)
// Seçim tarayıcıda küçük bir arayüz tercihi olarak saklanır. Sayfa açılırken temayı
// index.html'in başındaki betik uygular; buradaki kod Ayarlar'daki değişikliği yönetir.
// ============================================================

const TEMA_TERCIHI = "derstakip.tema";
const TEMA_SECENEKLERI = ["sistem", "acik", "koyu"];
const VARSAYILAN_TEMA = "koyu";
const sistemKoyuMu = window.matchMedia("(prefers-color-scheme: dark)");

// Kayıtlı seçim. Saklama alanına ulaşılamazsa (gizli pencere vb.) varsayılan kullanılır.
function temaSecimi() {
    try {
        const kayitli = localStorage.getItem(TEMA_TERCIHI);
        if (TEMA_SECENEKLERI.includes(kayitli)) return kayitli;
    } catch {
        // varsayılana düş
    }
    return VARSAYILAN_TEMA;
}

// Seçimi sayfaya uygular: <html data-tema="acik|koyu">. Renklerin hepsi stil.css'te bu değere bağlıdır.
function temayiUygula(secim) {
    const koyu = secim === "koyu" || (secim === "sistem" && sistemKoyuMu.matches);
    document.documentElement.dataset.tema = koyu ? "koyu" : "acik";
    document.querySelectorAll("#tema-secimi button").forEach((dugme) => {
        dugme.setAttribute("aria-checked", String(dugme.dataset.temaSecimi === secim));
    });
}

function temayiSec(secim) {
    try {
        localStorage.setItem(TEMA_TERCIHI, secim);
    } catch {
        // Saklanamadı: seçim sadece bu açılış için geçerli olur.
    }
    temayiUygula(secim);
}

document.getElementById("tema-secimi").addEventListener("click", (olay) => {
    const dugme = olay.target.closest("button[data-tema-secimi]");
    if (dugme) temayiSec(dugme.dataset.temaSecimi);
});
// "Sistem" seçiliyken Mac'in görünümü değişirse sayfa anında uyar.
sistemKoyuMu.addEventListener("change", () => {
    if (temaSecimi() === "sistem") temayiUygula("sistem");
});
temayiUygula(temaSecimi());

// ============================================================
// PENCERELER
// Pencereler tarayıcının "kipli" (modal) açılışıyla değil, sıradan açılışla gösterilir; çünkü
// kipli açılış sayfanın geri kalanını (alt çubuk dahil) tıklanamaz yapar. Arkayı karartan perde,
// Esc ile kapatma ve arkadaki sayfanın kilitlenmesi burada elle yapılır.
// ============================================================

// Alt çubuktaki tuşların açtığı ana pencereler: pencerenin kimliği -> tuşun adı
const ANA_PENCERELER = {
    "yoklama-penceresi": "yoklama",
    "ders-penceresi": "ders",
    "donem-penceresi": "donem",
    "ayarlar-penceresi": "ayarlar",
};
const dock = document.getElementById("dock");
const perde = document.getElementById("perde");
const ustPerde = document.getElementById("ust-perde");
const sayfa = document.querySelector("main");

// O an açık olan ana pencere (yoksa null).
function acikAnaPencere() {
    return Object.keys(ANA_PENCERELER).map((kimlik) => document.getElementById(kimlik)).find((p) => p.open) || null;
}

// Bir pencerenin üstünde açılmış küçük pencere (ör. "Akademik takvimden doldur"), yoksa null.
function acikUstPencere() {
    return document.querySelector("dialog.ust-pencere[open]");
}

// Bir pencereyi açar. Bütün pencereler bununla açılır.
function pencereyiAc(pencere) {
    if (!pencere.open) pencere.show();
    pencereDurumunuGuncelle();
}

// Pencere açılıp kapandıkça: perdeleri, arkadaki sayfanın kilidini ve alt çubuktaki aktif tuşu günceller.
function pencereDurumunuGuncelle() {
    const acik = acikAnaPencere();
    perde.hidden = acik === null;
    ustPerde.hidden = acikUstPencere() === null;
    // Pencere açıkken arkadaki sayfa tıklanamaz ve klavyeyle gezilemez (alt çubuk hariç).
    sayfa.inert = acik !== null;
    aktifTusuGoster(acik ? ANA_PENCERELER[acik.id] : "takvim");
}

// Açık pencereyi kapatır. Kapandıysa (ya da zaten açık pencere yoksa) true döner.
// Dönem ekranında kaydedilmemiş değişiklik varsa mevcut onay sorulur; vazgeçilirse false döner.
function acikPencereyiKapat() {
    const ust = acikUstPencere();
    if (ust) ust.close();
    const acik = acikAnaPencere();
    if (!acik) return true;
    if (acik.id === "donem-penceresi") return donemEkraniniKapat();
    acik.close();
    return true;
}

document.querySelectorAll("dialog").forEach((pencere) => {
    pencere.addEventListener("close", pencereDurumunuGuncelle);
});

// Esc: önce üstteki küçük pencereyi, yoksa açık ana pencereyi kapatır.
document.addEventListener("keydown", (olay) => {
    if (olay.key !== "Escape") return;
    const ust = acikUstPencere();
    if (ust) {
        ust.close();
        olay.preventDefault();
    } else if (acikAnaPencere()) {
        acikPencereyiKapat();
        olay.preventDefault();
    }
});

// Pencerenin dışına (perdeye) tıklanınca kapanır. Ders formu hariç: yanlışlıkla dışına tıklayınca
// doldurulan form kaybolmasın (o, × ya da Vazgeç ile kapanır).
perde.addEventListener("click", () => {
    const acik = acikAnaPencere();
    if (acik && acik.id !== "ders-penceresi") acikPencereyiKapat();
});
ustPerde.addEventListener("click", () => acikUstPencere()?.close());

document.getElementById("ayarlar-kapat").addEventListener("click", () => {
    document.getElementById("ayarlar-penceresi").close();
});

// ============================================================
// ALT ÇUBUK (DOCK)
// Tuşlar: takvim, yoklama, ders (ders ekle), donem, ayarlar. Yeni ana eylemler buraya eklenir:
// index.html'e bir tuş, ANA_PENCERELER'e penceresi, TUS_EYLEMLERI'ne açan fonksiyon.
// ============================================================

const TUS_EYLEMLERI = {
    yoklama: () => yoklamaPenceresiniAc(),
    ders: () => secimEkraniniAc(),
    donem: () => donemEkraniniAc(),
    ayarlar: () => pencereyiAc(document.getElementById("ayarlar-penceresi")),
};

// Aktif tuşu işaretler; çizgi ve ışık o tuşun üstüne kayar (kayma stil.css'te, ~200 ms).
function aktifTusuGoster(ad) {
    const tuslar = [...dock.querySelectorAll("button[data-tus]")];
    tuslar.forEach((tus, sira) => {
        const aktif = tus.dataset.tus === ad;
        if (aktif) {
            tus.setAttribute("aria-current", "page");
            dock.style.setProperty("--aktif-sira", sira);
        } else {
            tus.removeAttribute("aria-current");
        }
    });
}

// Bir tuşa basılınca: açık pencere varsa önce o kapanır (kaydedilmemiş değişiklikte onay sorulur;
// vazgeçilirse hiçbir şey değişmez). "Takvim" ya da zaten açık olan pencerenin tuşu sadece kapatır.
function dockTusunaBasildi(ad) {
    const acik = acikAnaPencere();
    const acikTus = acik ? ANA_PENCERELER[acik.id] : "takvim";
    if (!acikPencereyiKapat()) return;
    if (ad === "takvim" || ad === acikTus) return;
    TUS_EYLEMLERI[ad]();
}

dock.addEventListener("click", (olay) => {
    const tus = olay.target.closest("button[data-tus]");
    if (tus) dockTusunaBasildi(tus.dataset.tus);
});

// Yoklama tuşundaki rozet: bekleyen oturum sayısı (0 ise rozet yok, 99'dan fazlaysa "99+").
function dockRozetiniGuncelle(sayi) {
    const rozet = document.getElementById("dock-rozet");
    rozet.hidden = sayi === 0;
    rozet.textContent = sayi > 99 ? "99+" : String(sayi);
    const tus = dock.querySelector('button[data-tus="yoklama"]');
    const etiket = sayi > 0 ? `Yoklama (${sayi} bekliyor)` : "Yoklama";
    tus.title = etiket;
    tus.setAttribute("aria-label", etiket);
}

pencereDurumunuGuncelle();
