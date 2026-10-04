// Üst çubuktaki arama: dersler (kod, ad), sınavlar/kalemler ve ders notları.
// Eşleştirme sunucuda yapılır (/api/ara; Türkçe harflere duyarlı). Burada kutu, sonuç listesi
// ve klavye gezinmesi vardır. uygulama.js ve genel.js'ten sonra yüklenir.

const aramaAlani = document.getElementById("arama");
const aramaKutusu = document.getElementById("arama-kutusu");
const aramaSonuclari = document.getElementById("arama-sonuclari");
const ARAMA_GRUPLARI = { dersler: "Dersler", kalemler: "Sınavlar ve kalemler", notlar: "Notlar" };
let aramaZamanlayici = null;   // yazarken 200 ms bekleyip arar
let aramaNo = 0;               // geç gelen eski yanıtlar yok sayılır
let aramaSonucListesi = [];
let seciliSonuc = -1;          // klavyeyle üzerinde durulan sonuç

// Kısayol ipucu: Mac'te ⌘K, diğerlerinde Ctrl K.
const macMi = /Mac|iPhone|iPad/.test(navigator.platform || "");
document.getElementById("arama-kisayolu").textContent = macMi ? "⌘K" : "Ctrl K";

function aramayiKapat() {
    aramaSonuclari.hidden = true;
    aramaKutusu.setAttribute("aria-expanded", "false");
    aramaSonucListesi = [];
    seciliSonuc = -1;
}

// Kutuyu temizler ve sonuçları kapatır (Esc'te ve bir sonuç seçilince).
function aramayiTemizle() {
    clearTimeout(aramaZamanlayici);
    aramaNo++;
    aramaKutusu.value = "";
    aramayiKapat();
}

async function aramaYap() {
    const aranan = aramaKutusu.value.trim();
    if (aranan.length < 2) {   // en az 2 karakter
        aramayiKapat();
        return;
    }
    const buArama = ++aramaNo;
    let sonuclar;
    try {
        sonuclar = (await istekGonder("GET", `/api/ara?q=${encodeURIComponent(aranan)}`)).sonuclar;
    } catch {
        return;
    }
    if (buArama !== aramaNo) return;
    aramaSonucListesi = sonuclar;
    seciliSonuc = sonuclar.length > 0 ? 0 : -1;
    aramaSonuclariniCiz();
}

function aramaSonuclariniCiz() {
    aramaSonuclari.replaceChildren();
    if (aramaSonucListesi.length === 0) {
        aramaSonuclari.appendChild(eleman("div", "ic-satir bos", "Sonuç bulunamadı"));
    }
    let oncekiGrup = null;
    aramaSonucListesi.forEach((sonuc, sira) => {
        if (sonuc.grup !== oncekiGrup) {
            aramaSonuclari.appendChild(eleman("p", "arama-grubu", ARAMA_GRUPLARI[sonuc.grup]));
            oncekiGrup = sonuc.grup;
        }
        const kare = eleman("span", "ders-karesi");
        kare.style.background = renkBul(sonuc.renk).kod;
        const satir = icSatir({ sol: kare, baslik: sonuc.baslik, aciklama: sonuc.aciklama });
        satir.classList.add("tiklanabilir");
        satir.id = `arama-sonucu-${sira}`;
        satir.setAttribute("role", "option");
        satir.setAttribute("aria-selected", String(sira === seciliSonuc));
        // mousedown: kutu odağını kaybetmeden önce seçilsin.
        satir.addEventListener("mousedown", (olay) => {
            olay.preventDefault();
            aramaSonucunuSec(sira);
        });
        aramaSonuclari.appendChild(satir);
    });
    aramaSonuclari.hidden = false;
    aramaKutusu.setAttribute("aria-expanded", "true");
    if (seciliSonuc >= 0) aramaKutusu.setAttribute("aria-activedescendant", `arama-sonucu-${seciliSonuc}`);
    else aramaKutusu.removeAttribute("aria-activedescendant");
}

// Seçilen sonuca gider: ders -> dersin paneli; kalem -> Not hesabı sekmesi (satır vurgulu);
// not -> Notlar sekmesi. Ardından kutu temizlenir ve kapanır.
function aramaSonucunuSec(sira) {
    const sonuc = aramaSonucListesi[sira];
    if (!sonuc) return;
    aramayiTemizle();
    aramaKutusu.blur();
    const ders = dersler.find((d) => d.id === sonuc.ders_id);
    if (!ders) return;
    if (sonuc.grup === "kalemler") dersiAc(ders, "hesap", sonuc.kalem_id);
    else if (sonuc.grup === "notlar") dersiAc(ders, "notlar");
    else dersiAc(ders);
}

aramaKutusu.addEventListener("input", () => {
    clearTimeout(aramaZamanlayici);
    aramaZamanlayici = setTimeout(aramaYap, 200);
});

aramaKutusu.addEventListener("keydown", (olay) => {
    if (olay.key === "Escape") {
        // Esc: temizler ve kapatır (pencere kapatma kısayoluna gitmesin).
        olay.preventDefault();
        olay.stopPropagation();
        aramayiTemizle();
        aramaKutusu.blur();
        return;
    }
    if (aramaSonuclari.hidden || aramaSonucListesi.length === 0) return;
    if (olay.key === "ArrowDown" || olay.key === "ArrowUp") {
        olay.preventDefault();
        const adim = olay.key === "ArrowDown" ? 1 : -1;
        seciliSonuc = (seciliSonuc + adim + aramaSonucListesi.length) % aramaSonucListesi.length;
        aramaSonuclariniCiz();
    } else if (olay.key === "Enter") {
        olay.preventDefault();
        aramaSonucunuSec(seciliSonuc);
    }
});

// Kutudan çıkılınca sonuçlar kapanır (yazı kalır; geri dönülünce yeniden aranır).
aramaKutusu.addEventListener("blur", aramayiKapat);
aramaKutusu.addEventListener("focus", () => {
    if (aramaKutusu.value.trim().length >= 2) aramaYap();
});

// Cmd+K / Ctrl+K: arama kutusuna geçer (bir pencere açıkken çalışmaz; içerik o sırada kilitlidir).
document.addEventListener("keydown", (olay) => {
    if (!(olay.metaKey || olay.ctrlKey) || olay.altKey || olay.shiftKey || olay.key.toLowerCase() !== "k") return;
    olay.preventDefault();
    if (acikAnaPencere()) return;
    aramaKutusu.focus();
    aramaKutusu.select();
});
