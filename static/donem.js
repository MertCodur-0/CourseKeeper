// Dönem ekranı ("Dönem" butonu): iki sekmeli pencere.
//   Akademik takvim : derslerin ilk/son günü, final dönemi, ders yapılmayan tarihler
//   GPA             : önceki kredi/GPA, hedef GPA ve bu dönemin hedef harfleriyle yeni genel GPA
// uygulama.js'ten sonra yüklenir; oradaki yardımcıları kullanır (dersler, istekGonder,
// mesajGoster, eleman, renkBul, puaniCoz, ikiOndalik, dersleriYukle).

// ============================================================
// DURUM ve SAYFADAKİ PARÇALAR
// ============================================================

let kayitliDonemVar = false;   // sunucuda kayıtlı bir dönem var mı
let donemAnlik = "";           // akademik takvim formunun son kaydedilmiş hali (değişiklik var mı diye)
let simulasyon = {};           // GPA simülasyonu: {ders kimliği: denenen harf}. Kaydedilmez.
let okunanDonemler = [];       // "Akademik takvimden doldur" ile okunan dönemler (forma uygulanmayı bekler)
let okumaNotlari = [];         // okumayla ilgili notlar (ör. "Sayfa uzun olduğu için kısaltıldı")
let takvimOkumaNo = 0;         // her okumanın numarası (pencere kapanınca eski okuma yok sayılır)

const donemPenceresi = document.getElementById("donem-penceresi");
const donemSekmeleri = document.getElementById("donem-sekmeleri");
const donemFormu = document.getElementById("donem-formu");
const dersDisiListesi = document.getElementById("ders-disi-listesi");
const donemHatasi = document.getElementById("donem-hatasi");
const donemUyarilari = document.getElementById("donem-uyarilari");
const donemOzeti = document.getElementById("donem-ozeti");
const donemKayitDurumu = document.getElementById("donem-kayit-durumu");
const donemKaydet = document.getElementById("donem-kaydet");
const donemSil = document.getElementById("donem-sil");

const gpaSonucu = document.getElementById("gpa-sonucu");
const gpaOncekiKredi = document.getElementById("gpa-onceki-kredi");
const gpaOncekiGpa = document.getElementById("gpa-onceki-gpa");
const gpaHedef = document.getElementById("gpa-hedef");
const gpaHatasi = document.getElementById("gpa-hatasi");
const gpaKayitDurumu = document.getElementById("gpa-kayit-durumu");
const gpaTablosu = document.getElementById("gpa-tablosu");
const gpaDersYok = document.getElementById("gpa-ders-yok");
const simulasyonKutusu = document.getElementById("simulasyon");

// ============================================================
// PENCERE: açma, kapama, sekmeler
// ============================================================

// Pencereyi açar: dönemi ve GPA ayarlarını sunucudan alıp formları doldurur.
// Ders eklenmemişken de açılır.
async function donemEkraniniAc() {
    let donemVerisi;
    let gpaAyarlari;
    try {
        [donemVerisi, gpaAyarlari] = await Promise.all([
            istekGonder("GET", "/api/donem"),
            istekGonder("GET", "/api/gpa"),
        ]);
    } catch {
        alert("Dönem bilgileri alınamadı. Sunucunun çalıştığından emin olup tekrar dene.");
        return;
    }
    donemFormunuDoldur(donemVerisi);
    gpaAlanlariniDoldur(gpaAyarlari);
    simulasyon = {};
    donemSekmesiniGoster("takvim");
    pencereyiAc(donemPenceresi);
    gpaCiz();
}

// Kapatmadan önce: akademik takvimde kaydedilmemiş değişiklik varsa onay ister.
// Pencere kapandıysa true, kullanıcı vazgeçtiyse false döner (alt çubuk buna göre davranır).
function donemEkraniniKapat() {
    const degisti = JSON.stringify(donemFormunuOku()) !== donemAnlik;
    if (degisti && !confirm("Akademik takvimde kaydedilmemiş değişiklikler var. Yine de kapatılsın mı?")) return false;
    donemPenceresi.close();
    return true;
}

function donemSekmesiniGoster(ad) {
    donemSekmeleri.querySelectorAll("button").forEach((dugme) => {
        dugme.classList.toggle("secili", dugme.dataset.sekme === ad);
    });
    donemPenceresi.querySelectorAll(".donem-sekmesi").forEach((sekme) => {
        sekme.hidden = sekme.dataset.sekme !== ad;
    });
    if (ad === "gpa") gpaCiz();
}

// ============================================================
// SEKME: AKADEMİK TAKVİM
// ============================================================

// "2026-10-05" -> gün numarası (iki tarih arasındaki gün farkını bulmak için).
function gunNumarasi(tarih) {
    const [yil, ay, gun] = tarih.split("-").map(Number);
    return Date.UTC(yil, ay - 1, gun) / 86400000;
}

// Ders yapılmayan tarihler listesine bir satır ekler ve eklenen satırı döndürür.
function dersDisiSatiriEkle(veri = {}) {
    const satir = document.getElementById("ders-disi-sablonu").content.firstElementChild.cloneNode(true);
    satir.querySelectorAll("[data-alan]").forEach((alan) => {
        if (veri[alan.dataset.alan] != null) alan.value = veri[alan.dataset.alan];
    });
    dersDisiListesi.appendChild(satir);
    return satir;
}

// Formu sunucudan gelen dönemle doldurur (dönem yoksa boş form).
function donemFormunuDoldur(veri) {
    okunanTakvimiTemizle();   // akademik takvimden okunup kaydedilmemiş ne varsa bırakılır
    const donem = veri.donem || {};
    kayitliDonemVar = veri.donem !== null;
    for (const ad of ["ad", "baslangic", "bitis", "final_baslangic", "final_bitis"]) {
        donemFormu.elements[ad].value = donem[ad] ?? "";
    }
    dersDisiListesi.replaceChildren();
    for (const satir of veri.ders_disi_tarihler) dersDisiSatiriEkle(satir);
    donemSil.hidden = !kayitliDonemVar;
    donemKayitDurumu.textContent = "";
    donemAnlik = JSON.stringify(donemFormunuOku());
    donemiDogrula();
}

// Formu sunucuya gönderilecek nesneye çevirir.
function donemFormunuOku() {
    const veri = {};
    for (const ad of ["ad", "baslangic", "bitis", "final_baslangic", "final_bitis"]) {
        veri[ad] = donemFormu.elements[ad].value.trim();
    }
    veri.ders_disi_tarihler = [...dersDisiListesi.children].map((satir) => {
        const tarih = {};
        satir.querySelectorAll("[data-alan]").forEach((alan) => { tarih[alan.dataset.alan] = alan.value.trim(); });
        return tarih;
    });
    return veri;
}

// Her değişiklikte çalışır: eksik/hatalı alanları kırmızı yapar, sarı uyarıları ve özeti yazar,
// form geçerli değilse Kaydet'i pasif yapar. Sarı uyarılar kaydı engellemez.
function donemiDogrula() {
    const veri = donemFormunuOku();
    const alan = (ad) => donemFormu.elements[ad];
    let gecerli = true;
    const hatalar = [];
    const uyarilar = [];

    // 1) Boş zorunlu alanlar.
    donemFormu.querySelectorAll("input, select").forEach((girdi) => {
        const eksik = "zorunlu" in girdi.dataset && girdi.value.trim() === "";
        girdi.classList.toggle("eksik", eksik);
        if (eksik) gecerli = false;
    });

    // 2) Kaydı engelleyen kurallar. ("2026-10-05" < "2026-12-25" karşılaştırması metin olarak da doğru.)
    const aralikVar = veri.baslangic !== "" && veri.bitis !== "";
    if (aralikVar && veri.bitis <= veri.baslangic) {
        alan("bitis").classList.add("eksik");
        hatalar.push("Derslerin son günü ilk günden sonra olmalı.");
    }
    if (veri.final_bitis !== "" && (veri.final_baslangic === "" || veri.final_bitis <= veri.final_baslangic)) {
        alan("final_bitis").classList.add("eksik");
        hatalar.push("Final dönemi bitişi başlangıcından sonra olmalı.");
    }
    const turAdlari = Object.fromEntries(AYARLAR.dersDisiTurleri.map((tur) => [tur.anahtar, tur.ad]));
    [...dersDisiListesi.children].forEach((satir, sira) => {
        const tarih = veri.ders_disi_tarihler[sira];
        if (tarih.baslangic === "" || tarih.bitis === "") return;
        if (tarih.bitis < tarih.baslangic) {
            satir.querySelector('[data-alan="bitis"]').classList.add("eksik");
            hatalar.push("Ders yapılmayan tarihin bitişi başlangıcından önce olamaz.");
            return;
        }
        // 3) Sarı uyarı: dönem aralığının dışına taşan tarih.
        if (aralikVar && (tarih.baslangic < veri.baslangic || tarih.bitis > veri.bitis)) {
            uyarilar.push(`“${tarih.ad || turAdlari[tarih.tur]}” (${tarihiGoster(tarih.baslangic)}) dönem aralığının dışında.`);
        }
    });
    if (veri.final_baslangic !== "" && veri.bitis !== "" && veri.final_baslangic <= veri.bitis) {
        uyarilar.push("Final dönemi, derslerin son gününden sonra başlamalı.");
    }
    if (hatalar.length > 0) gecerli = false;

    mesajGoster(donemHatasi, [...new Set(hatalar)].join(" "));
    donemUyarilari.replaceChildren(...uyarilar.map((yazi) => eleman("p", "", yazi)));
    donemUyarilari.hidden = uyarilar.length === 0;

    // 4) Canlı özet: takvim günü ve (yukarı yuvarlanmış) hafta sayısı.
    let ozet = "";
    if (aralikVar && veri.bitis > veri.baslangic) {
        const ilk = gunNumarasi(veri.baslangic);
        const son = gunNumarasi(veri.bitis);
        const gunSayisi = son - ilk + 1;   // ilk ve son gün dahil
        // Ders yapılmayan günler: dönemin içine düşenler, üst üste binenler bir kez sayılır.
        const dersDisiGunler = new Set();
        for (const tarih of veri.ders_disi_tarihler) {
            if (tarih.baslangic === "" || tarih.bitis === "" || tarih.bitis < tarih.baslangic) continue;
            const bas = Math.max(gunNumarasi(tarih.baslangic), ilk);
            const bit = Math.min(gunNumarasi(tarih.bitis), son);
            for (let gun = bas; gun <= bit; gun++) dersDisiGunler.add(gun);
        }
        ozet = `Dönem: ${Math.ceil(gunSayisi / 7)} hafta, ${gunSayisi} gün`;
        if (dersDisiGunler.size > 0) {
            ozet += ` (ders yapılmayan ${dersDisiGunler.size} gün hariç: ${gunSayisi - dersDisiGunler.size} ders günü)`;
        }
    }
    mesajGoster(donemOzeti, ozet);

    donemKaydet.disabled = !gecerli;
    return gecerli;
}

async function donemiKaydet() {
    if (!donemiDogrula()) return;
    try {
        const sonuc = await istekGonder("PUT", "/api/donem", donemFormunuOku());
        donemFormunuDoldur(sonuc);
        donemKayitDurumu.textContent = "Kaydedildi";
        await dersleriYukle();   // dönem tarihleri değişti: devamsızlık hesabı ve takvim yenilensin
    } catch (hata) {
        mesajGoster(donemHatasi, hata.message);
    }
}

async function donemiSil() {
    if (!confirm("Dönem ve ders yapılmayan tarihler silinsin mi? Derslerin ve GPA ayarların silinmez.")) return;
    try {
        await istekGonder("DELETE", "/api/donem");
        donemFormunuDoldur({ donem: null, ders_disi_tarihler: [] });
        donemKayitDurumu.textContent = "Dönem silindi";
        await dersleriYukle();
    } catch (hata) {
        mesajGoster(donemHatasi, hata.message);
    }
}

// ============================================================
// AKADEMİK TAKVİMDEN DOLDUR
// Sayfa adresi ya da dosya sunucuya gider, sunucu Gemini ile okur (anahtar tarayıcıya gelmez).
// Sonuç yukarıdaki formu ön doldurur; Kaydet'e basılana kadar hiçbir şey kaydedilmez.
// ============================================================

const takvimDoldurPenceresi = document.getElementById("takvim-doldur-penceresi");
const takvimDoldurIcerigi = document.getElementById("takvim-doldur-icerigi");
const takvimOkunuyor = document.getElementById("takvim-okunuyor");
const takvimOkumaHatasi = document.getElementById("takvim-okuma-hatasi");
const takvimNotu = document.getElementById("takvim-notu");
const takvimBirakma = document.getElementById("takvim-birakma");
const takvimDosyasi = document.getElementById("takvim-dosyasi");
const sinavDonemleriBolumu = document.getElementById("sinav-donemleri-bolumu");

function takvimDoldurSekmesiniGoster(ad) {
    document.querySelectorAll("#takvim-doldur-sekmeleri button").forEach((dugme) => {
        dugme.classList.toggle("secili", dugme.dataset.sekme === ad);
    });
    takvimDoldurIcerigi.querySelectorAll(":scope > [data-sekme]").forEach((sekme) => {
        sekme.hidden = sekme.dataset.sekme !== ad;
    });
}

function takvimDoldurPenceresiniAc() {
    mesajGoster(takvimOkumaHatasi, "");
    takvimOkunuyorGoster(false);
    takvimDoldurSekmesiniGoster("adres");
    pencereyiAc(takvimDoldurPenceresi);
}

// "Okunuyor..." göstergesini açar/kapatır (açıkken adres ve dosya alanları gizlenir).
function takvimOkunuyorGoster(acik) {
    takvimOkunuyor.hidden = !acik;
    takvimDoldurIcerigi.hidden = acik;
}

// Adresi ya da dosyayı (FormData içinde) sunucuya gönderir; sonuç gelince forma uygular.
async function takvimiOku(veri) {
    const buOkuma = ++takvimOkumaNo;
    mesajGoster(takvimOkumaHatasi, "");
    takvimOkunuyorGoster(true);
    let sonuc;
    let hata = null;
    try {
        const yanit = await fetch("/api/akademik-takvim", { method: "POST", body: veri });
        sonuc = await yanit.json();
        if (!yanit.ok) hata = sonuc.hata || "Akademik takvim okunamadı.";
    } catch {
        hata = "Sunucuya ulaşılamadı ya da yanıt anlaşılamadı. Sunucunun çalıştığından emin olup tekrar dene.";
    }
    // Bu arada pencere kapatıldıysa ya da başka bir okuma başladıysa sonucu yok say.
    if (buOkuma !== takvimOkumaNo || !takvimDoldurPenceresi.open) return;
    takvimOkunuyorGoster(false);
    if (hata) {
        mesajGoster(takvimOkumaHatasi, hata + " Tarihleri formdan elle de girebilirsin.");
        return;
    }

    // Formda ya da kayıtta dönem bilgisi varsa üzerine yazmadan önce sor. Vazgeçilirse hiçbir şey değişmez.
    const mevcut = donemFormunuOku();
    const doluMu = kayitliDonemVar || mevcut.baslangic !== "" || mevcut.bitis !== "" || mevcut.ders_disi_tarihler.length > 0;
    if (doluMu && !confirm("Mevcut dönem ve tatil listesi değiştirilecek, devam edilsin mi?")) {
        takvimDoldurPenceresi.close();
        return;
    }
    takvimDoldurPenceresi.close();
    okunanDonemler = sonuc.donemler;
    okumaNotlari = sonuc.notlar || [];
    okunanDonemiUygula(varsayilanDonem());
}

// Seçilen dosyayı kontrol edip okutur (syllabus ile aynı kurallar: PDF/PNG/JPG, en fazla 20 MB).
function takvimDosyasiniOku(dosya) {
    const turUygun = ["application/pdf", "image/png", "image/jpeg"].includes(dosya.type)
        || /\.(pdf|png|jpe?g)$/i.test(dosya.name);
    if (!turUygun) {
        mesajGoster(takvimOkumaHatasi, "Bu dosya türü desteklenmiyor. Lütfen PDF, PNG veya JPG dosyası seç.");
        return;
    }
    if (dosya.size > AYARLAR.syllabusEnFazlaMB * 1024 * 1024) {
        mesajGoster(takvimOkumaHatasi, `Dosya çok büyük. En fazla ${AYARLAR.syllabusEnFazlaMB} MB'lık dosya yükleyebilirsin.`);
        return;
    }
    const veri = new FormData();
    veri.append("dosya", dosya);
    takvimiOku(veri);
}

// Belgede birden fazla dönem varsa hangisi önce gösterilsin: bugünü içeren, yoksa bugünden sonra
// başlayan en yakın dönem, o da yoksa ilki. (Seçimi model yapmaz; kullanıcı listeden değiştirebilir.)
function varsayilanDonem() {
    const bugun = AYARLAR.bugun;
    const icinde = okunanDonemler.findIndex((donem) => donem.baslangic && donem.baslangic <= bugun
        && bugun <= (donem.final_bitis || donem.bitis || donem.baslangic));
    if (icinde !== -1) return icinde;
    let enYakin = -1;
    okunanDonemler.forEach((donem, sira) => {
        if (donem.baslangic && donem.baslangic > bugun
            && (enYakin === -1 || donem.baslangic < okunanDonemler[enYakin].baslangic)) enYakin = sira;
    });
    return enYakin === -1 ? 0 : enYakin;
}

// Okunan dönemlerden birini forma yazar (kaydetmez). Emin olunmayan alanlar sarı işaretlenir;
// boş kalan zorunlu alanlar (ilk ve son gün) formun kendi kuralıyla kırmızı olur.
function okunanDonemiUygula(sira) {
    const donem = okunanDonemler[sira];
    donemFormu.querySelectorAll(".emin-degil").forEach((alan) => alan.classList.remove("emin-degil"));
    for (const ad of ["ad", "baslangic", "bitis", "final_baslangic", "final_bitis"]) {
        donemFormu.elements[ad].value = donem[ad] ?? "";
    }
    for (const ad of donem.emin_olmayanlar) {
        donemFormu.elements[ad].classList.add("emin-degil");
        donemFormu.elements[ad].title = "model emin değil";
    }
    // Tatiller: ders yapılmayan tarihler listesine "Tatil" türüyle.
    dersDisiListesi.replaceChildren();
    for (const tatil of donem.tatiller) {
        const satir = dersDisiSatiriEkle({ tur: "tatil", ...tatil });
        if (tatil.emin_degil) {
            satir.querySelectorAll('input[type="date"]').forEach((alan) => {
                alan.classList.add("emin-degil");
                alan.title = "model emin değil";
            });
        }
    }

    // Üstteki not: ne okunduğu, (varsa) dönem seçimi ve okuma notları.
    takvimNotu.replaceChildren();
    const baslik = eleman("p");
    baslik.appendChild(eleman("strong", "", "Akademik takvimden okundu, lütfen kontrol et."));
    takvimNotu.appendChild(baslik);
    if (okunanDonemler.length > 1) {
        const secim = eleman("p", "", `Belgede ${okunanDonemler.length} dönem bulundu. Kullanılacak dönem:`);
        const liste = eleman("select");
        liste.id = "okunan-donem-secimi";
        liste.setAttribute("aria-label", "Kullanılacak dönem");
        okunanDonemler.forEach((d, i) => {
            const tarih = d.baslangic ? ` (${tarihiGoster(d.baslangic)})` : "";
            liste.add(new Option((d.ad || `Dönem ${i + 1}`) + tarih, i));
        });
        liste.value = sira;
        liste.addEventListener("change", () => okunanDonemiUygula(Number(liste.value)));
        secim.appendChild(liste);
        takvimNotu.appendChild(secim);
    }
    takvimNotu.appendChild(eleman("p", "",
        "Sarı alanlar: modelin emin olmadığı tarihler. Kırmızı alanlar: belgede bulunamadı, sen doldur. "
        + "Kaydet'e basana kadar hiçbir şey kaydedilmez."));
    for (const not of okumaNotlari) takvimNotu.appendChild(eleman("p", "", not));
    takvimNotu.hidden = false;

    // Sınav dönemleri: varsayılan işaretsiz. İşaretlenen, listeye "Sınav dönemi" türüyle eklenir.
    const sinavListesi = document.getElementById("sinav-donemleri-listesi");
    sinavListesi.replaceChildren();
    for (const sinav of donem.sinav_donemleri) {
        const etiket = eleman("label", "sinav-donemi");
        const kutu = eleman("input");
        kutu.type = "checkbox";
        let yazi = `${sinav.ad || "Sınav dönemi"} · ${tarihiGoster(sinav.baslangic)}`
            + (sinav.bitis !== sinav.baslangic ? ` – ${tarihiGoster(sinav.bitis)}` : "");
        if (sinav.emin_degil) yazi += " (model emin değil)";
        if (sinav.bitis < sinav.baslangic) {
            yazi += " — tarihler tutarsız (bitiş başlangıçtan önce), listeye eklenemez";
            kutu.disabled = true;
        }
        let eklenenSatir = null;
        kutu.addEventListener("change", () => {
            if (kutu.checked) {
                eklenenSatir = dersDisiSatiriEkle({ tur: "sinav", ad: sinav.ad, baslangic: sinav.baslangic, bitis: sinav.bitis });
            } else if (eklenenSatir) {
                eklenenSatir.remove();
                eklenenSatir = null;
            }
            donemiDogrula();
        });
        etiket.append(kutu, eleman("span", "", yazi));
        sinavListesi.appendChild(etiket);
    }
    // Final dönemi derslerin son gününden sonra olduğu için listeye girmez; sadece bilgi satırı.
    const finalBilgisi = document.getElementById("final-bilgisi");
    finalBilgisi.hidden = !donem.final_baslangic;
    if (donem.final_baslangic) {
        finalBilgisi.textContent = `Final dönemi: ${tarihiGoster(donem.final_baslangic)}`
            + (donem.final_bitis ? ` – ${tarihiGoster(donem.final_bitis)}` : "")
            + " (derslerin son gününden sonra olduğu için bu listeye eklenmez; yukarıdaki final alanlarına yazıldı).";
    }
    sinavDonemleriBolumu.hidden = donem.sinav_donemleri.length === 0 && !donem.final_baslangic;

    donemKayitDurumu.textContent = "";
    donemiDogrula();
}

// Akademik takvimden okunup forma yazılanların izlerini (not, sınav dönemleri, sarı işaretler) kaldırır.
function okunanTakvimiTemizle() {
    okunanDonemler = [];
    okumaNotlari = [];
    takvimNotu.hidden = true;
    sinavDonemleriBolumu.hidden = true;
    donemFormu.querySelectorAll(".emin-degil").forEach((alan) => {
        alan.classList.remove("emin-degil");
        alan.removeAttribute("title");
    });
}

// ============================================================
// SEKME: GPA
// Harf puanları app.py'deki NOT_OLCEGI'nden gelir (AYARLAR.notOlcegi), burada kopyası yoktur.
// ============================================================

// GPA'yı ekranda 2 ondalıkla yazar (3 -> "3.00"). Yuvarlama kuralı app.py'deki GPA_ROUNDING.
// Sadece gösterim içindir; karşılaştırmalar yuvarlanmamış değerle yapılır.
function gpaYaz(sayi) {
    const yuzKati = Math.round(sayi * 1e8) / 1e6;   // küsurat hatalarını temizler
    const yuvarlanmis = AYARLAR.gpaRounding === "floor" ? Math.floor(yuzKati) : Math.round(yuzKati);
    return (yuvarlanmis / 100).toFixed(2);
}

function seciliKrediBirimi() {
    return donemPenceresi.querySelector('input[name="kredi_birimi"]:checked').value;
}

function gpaAlanlariniDoldur(ayarlar) {
    gpaOncekiKredi.value = ayarlar.onceki_kredi ?? "";
    gpaOncekiGpa.value = ayarlar.onceki_gpa ?? "";
    gpaHedef.value = ayarlar.hedef_gpa ?? "";
    donemPenceresi.querySelector(`input[name="kredi_birimi"][value="${ayarlar.kredi_birimi}"]`).checked = true;
    gpaKayitDurumu.textContent = "";
}

// "Genel durum" alanlarını okur. Nokta da virgül de kabul edilir, en fazla 2 ondalık.
// Geçersiz alan kırmızı olur ve hesapta boş sayılır. İlk dönemde (önceki kredi 0) önceki GPA pasiftir.
function gpaAlanlariniOku() {
    let gecerli = true;
    function oku(girdi, enFazla) {
        const sayi = puaniCoz(girdi.value);
        const hatali = sayi !== null && !(sayi >= 0 && sayi <= enFazla);
        girdi.classList.toggle("eksik", hatali);
        if (hatali) gecerli = false;
        return hatali ? null : sayi;
    }
    const ayarlar = {
        onceki_kredi: oku(gpaOncekiKredi, Infinity),
        onceki_gpa: oku(gpaOncekiGpa, 4),
        hedef_gpa: oku(gpaHedef, 4),
        kredi_birimi: seciliKrediBirimi(),
    };
    gpaOncekiGpa.disabled = ayarlar.onceki_kredi === 0;
    mesajGoster(gpaHatasi, gecerli ? "" : "Kırmızı alandaki değer geçersiz (GPA 0 ile 4 arasında, en fazla 2 ondalık). Kaydedilmedi.");
    return { ayarlar, gecerli };
}

// Bir alan değişince: ayarlar geçerliyse kendiliğinden kaydedilir.
async function gpaAyarlariniKaydet() {
    const { ayarlar, gecerli } = gpaAlanlariniOku();
    gpaCiz();
    if (!gecerli) return;
    try {
        await istekGonder("PUT", "/api/gpa", ayarlar);
        gpaKayitDurumu.textContent = "Kaydedildi";
    } catch (hata) {
        mesajGoster(gpaHatasi, hata.message);
    }
}

// Ölçekte hedef olarak seçilebilen harfler (AA ... DD).
function hedefHarfleri() {
    return AYARLAR.notOlcegi.filter((harf) => harf.katsayi > 0);
}

// Dersin bu ekranda geçerli harfi: simülasyonda denenen harf, yoksa derse kayıtlı hedef.
function gecerliHarf(ders) {
    const harf = simulasyon[ders.id] ?? ders.hedef_not;
    return hedefHarfleri().find((satir) => satir.harf === harf) || null;
}

// GPA hesabı. Sadece "GPA'ya dahil" işaretli, hedef harfi ve seçilen birimde kredisi olan dersler girer.
function gpaHesapla(ayarlar) {
    let donemKredisi = 0;   // Kd
    let donemPuani = 0;     // Pd = Σ(kredi × harf puanı)
    for (const ders of dersler) {
        const kredi = ders[ayarlar.kredi_birimi];
        const harf = gecerliHarf(ders);
        if (!ders.gpaya_dahil || kredi == null || !harf) continue;
        donemKredisi += kredi;
        donemPuani += kredi * harf.katsayi;
    }
    if (donemKredisi <= 0) return null;   // hesaba giren ders yok

    const sonuc = { donemKredisi, donemGpa: donemPuani / donemKredisi };
    const oncekiKredi = ayarlar.onceki_kredi;   // Kp
    const ilkDonem = oncekiKredi === 0;
    if (oncekiKredi === null || (!ilkDonem && ayarlar.onceki_gpa === null)) return sonuc;   // genel GPA hesaplanamaz

    const oncekiPuan = ilkDonem ? 0 : oncekiKredi * ayarlar.onceki_gpa;   // Kp × Gp
    const toplamKredi = oncekiKredi + donemKredisi;
    sonuc.oncekiKredi = oncekiKredi;
    sonuc.oncekiGpa = ilkDonem ? null : ayarlar.onceki_gpa;
    sonuc.toplamKredi = toplamKredi;
    sonuc.yeniGpa = (oncekiPuan + donemPuani) / toplamKredi;
    if (ayarlar.hedef_gpa !== null) {
        sonuc.hedefGpa = ayarlar.hedef_gpa;
        // Hedefe ulaşmak için bu dönem gereken ortalama ve bu dönem ulaşılabilecek en yüksek genel GPA.
        sonuc.gerekenDonemGpa = (ayarlar.hedef_gpa * toplamKredi - oncekiPuan) / donemKredisi;
        sonuc.enYuksekGpa = (oncekiPuan + 4.0 * donemKredisi) / toplamKredi;
    }
    return sonuc;
}

// Sonuç kartını ve ders tablosunu baştan çizer.
function gpaCiz() {
    const { ayarlar } = gpaAlanlariniOku();
    gpaKartiniCiz(gpaHesapla(ayarlar));
    gpaTablosunuCiz(ayarlar.kredi_birimi);
}

// Sonuç kartı: sağ paneldeki sonuç kutusuyla aynı görünüm (yeşil ✓ / sarı ! / nötr).
function gpaKartiniCiz(sonuc) {
    gpaSonucu.replaceChildren();
    if (sonuc === null) {
        gpaSonucu.appendChild(eleman("p", "mesaj", "Hesap için hedef harfi ve kredisi olan en az bir ders gerekli."));
        return;
    }
    const kart = eleman("div", "hesap-sonucu gpa-karti");
    if (sonuc.yeniGpa === undefined) {
        kart.appendChild(eleman("strong", "",
            `Önceki GPA ve kredi girilmeden yeni genel GPA hesaplanamaz, dönem GPA'n: ${gpaYaz(sonuc.donemGpa)}`));
        gpaSonucu.appendChild(kart);
        return;
    }

    // Renk: hedef girilmişse yeşil (ulaşılıyor) ya da sarı (ulaşılmıyor); girilmemişse nötr.
    // Karşılaştırma yuvarlanmamış değerle yapılır.
    let renk = null;
    if (sonuc.hedefGpa !== undefined) renk = sonuc.yeniGpa >= sonuc.hedefGpa ? "yesil" : "sari";
    if (renk) kart.classList.add(renk);

    const anaYazi = eleman("strong", "ana-yazi");
    if (renk) {
        const simge = eleman("span", "durum-simgesi", renk === "yesil" ? "✓" : "!");
        simge.setAttribute("role", "img");
        simge.setAttribute("aria-label", renk === "yesil" ? "Hedef GPA'ya ulaşılıyor" : "Hedef GPA'ya ulaşılmıyor");
        anaYazi.appendChild(simge);
    }
    anaYazi.appendChild(eleman("span", "", `Yeni genel GPA: ${gpaYaz(sonuc.yeniGpa)}`));
    kart.appendChild(anaYazi);

    const suAn = sonuc.oncekiGpa === null ? "— (ilk dönem)" : gpaYaz(sonuc.oncekiGpa);
    kart.appendChild(eleman("p", "kucuk-not",
        `Şu an: ${suAn} · Bu dönem ortalaman: ${gpaYaz(sonuc.donemGpa)} · Toplam kredi: ${ikiOndalik(sonuc.oncekiKredi)} → ${ikiOndalik(sonuc.toplamKredi)}`));

    if (renk === "sari") {
        kart.appendChild(eleman("p", "", `Hedef GPA için bu dönem ortalaman en az ${gpaYaz(sonuc.gerekenDonemGpa)} olmalı.`));
        if (sonuc.gerekenDonemGpa > 4) {
            kart.appendChild(eleman("p", "",
                `Bu dönem tek başına yetmez: tüm derslerden AA alsan yeni GPA'n en fazla ${gpaYaz(sonuc.enYuksekGpa)} olur.`));
        }
    }
    gpaSonucu.appendChild(kart);
}

// "Bu dönemin dersleri" tablosu. Harf listesini değiştirmek derse kayıtlı hedefi DEĞİŞTİRMEZ,
// sadece bu ekrandaki hesabı değiştirir (simülasyon).
function gpaTablosunuCiz(krediBirimi) {
    // Tablo yeniden çizilince klavye odağı kaybolmasın diye odaktaki dersi hatırla.
    const odaktaki = document.activeElement?.closest?.("#gpa-tablosu [data-ders-id]");
    const odakBilgisi = odaktaki ? [odaktaki.dataset.dersId, document.activeElement.tagName] : null;

    gpaTablosu.replaceChildren();
    gpaTablosu.hidden = dersler.length === 0;
    gpaDersYok.hidden = dersler.length > 0;
    const birimAdi = krediBirimi === "akts" ? "AKTS" : "Kredi";

    if (dersler.length > 0) {
        const baslik = gpaTablosu.createTHead().insertRow();
        baslik.append(eleman("th", "", "Ders"), eleman("th", "", birimAdi), eleman("th", "", "Hedef harf"),
            eleman("th", "", "Harf puanı"), eleman("th", "", "GPA'ya dahil"));
    }
    const govde = gpaTablosu.createTBody();
    for (const ders of dersler) {
        const satir = govde.insertRow();
        satir.dataset.dersId = ders.id;
        const kredi = ders[krediBirimi];
        const harf = gecerliHarf(ders);

        // Ders: renk noktası, kod ve (hesaba girmiyorsa) küçük sarı uyarı
        const dersHucresi = satir.insertCell();
        const nokta = eleman("span", "renk-noktasi");
        nokta.style.background = renkBul(ders.renk).kod;
        dersHucresi.append(nokta, eleman("span", "", ders.kod));
        if (kredi == null) dersHucresi.appendChild(eleman("span", "satir-uyarisi", `${birimAdi} girilmemiş`));
        if (!harf) dersHucresi.appendChild(eleman("span", "satir-uyarisi", "Hedef harf seçilmemiş"));

        satir.insertCell().textContent = kredi == null ? "—" : kredi;

        // Hedef harf listesi. "Seç" sadece derse kayıtlı geçerli bir hedef yoksa bulunur.
        const kayitliHarf = hedefHarfleri().some((h) => h.harf === ders.hedef_not) ? ders.hedef_not : "";
        const liste = eleman("select");
        liste.setAttribute("aria-label", `${ders.kod}: hedef harf`);
        if (kayitliHarf === "") liste.add(new Option("Seç", ""));
        for (const secenek of hedefHarfleri()) liste.add(new Option(secenek.harf, secenek.harf));
        liste.value = harf ? harf.harf : "";
        liste.addEventListener("change", () => {
            // Kayıtlı hedefe geri dönüldüyse simülasyondan çıkar.
            if (liste.value === kayitliHarf) delete simulasyon[ders.id];
            else simulasyon[ders.id] = liste.value;
            gpaCiz();
        });
        const harfHucresi = satir.insertCell();
        harfHucresi.appendChild(liste);
        if (ders.id in simulasyon) {
            const isaret = eleman("span", "degisti-noktasi");
            isaret.title = `Simülasyon: derse kayıtlı hedef ${kayitliHarf || "yok"}`;
            harfHucresi.appendChild(isaret);
        }

        satir.insertCell().textContent = harf ? gpaYaz(harf.katsayi) : "—";

        // "GPA'ya dahil" derse kaydedilen bir ayardır (simülasyon değil): değişince hemen kaydedilir.
        const kutu = eleman("input");
        kutu.type = "checkbox";
        kutu.checked = ders.gpaya_dahil;
        kutu.setAttribute("aria-label", `${ders.kod}: GPA'ya dahil`);
        kutu.addEventListener("change", async () => {
            try {
                await istekGonder("PUT", `/api/dersler/${ders.id}/gpa`, { gpaya_dahil: kutu.checked });
                ders.gpaya_dahil = kutu.checked;
            } catch (hata) {
                mesajGoster(gpaHatasi, hata.message);
            }
            gpaCiz();
        });
        satir.insertCell().appendChild(kutu);
    }

    // Simülasyon satırı: kaç dersin harfi değiştirildi, sıfırlama ve kalıcı kaydetme.
    const degisen = Object.keys(simulasyon).length;
    simulasyonKutusu.hidden = degisen === 0;
    document.getElementById("simulasyon-yazisi").textContent = `Simülasyon: ${degisen} ders değiştirildi`;

    if (odakBilgisi) {
        gpaTablosu.querySelector(`tr[data-ders-id="${odakBilgisi[0]}"] ${odakBilgisi[1].toLowerCase()}`)?.focus();
    }
}

// Simülasyondaki harfleri derslerin hedef harfi olarak kalıcı kaydeder (onay ister).
async function simulasyonuKaydet() {
    const hedefler = Object.entries(simulasyon)
        .filter(([, harf]) => harf !== "")
        .map(([dersId, harf]) => ({ id: Number(dersId), hedef_not: harf }));
    if (hedefler.length === 0) return;
    if (!confirm(`${hedefler.length} dersin hedef harf notu bu ekrandaki harflerle değiştirilecek. Kaydedilsin mi?`)) return;
    try {
        await istekGonder("PUT", "/api/hedef-notlari", { hedefler });
        simulasyon = {};
        await dersleriYukle();   // takvim ve sağ panel de yeni hedefleri görsün
    } catch (hata) {
        mesajGoster(gpaHatasi, hata.message);
    }
    gpaCiz();
}

// ============================================================
// OLAYLAR
// ============================================================

// Pencere alt çubuktaki "Dönem" tuşuyla açılır. Esc ve dışına tıklama static/dock.js'te ele alınır;
// ikisi de donemEkraniniKapat'ı çağırır (kaydedilmemiş değişiklik varsa onay sorulur).
document.getElementById("donem-kapat").addEventListener("click", donemEkraniniKapat);
// Pencere kapanınca simülasyon sıfırlanır.
donemPenceresi.addEventListener("close", () => { simulasyon = {}; });

donemSekmeleri.addEventListener("click", (olay) => {
    const dugme = olay.target.closest("button[data-sekme]");
    if (dugme) donemSekmesiniGoster(dugme.dataset.sekme);
});

// Akademik takvim formu
document.getElementById("ders-disi-ekle").addEventListener("click", () => {
    dersDisiSatiriEkle();
    donemiDogrula();
});
donemFormu.addEventListener("click", (olay) => {
    const silDugmesi = olay.target.closest(".satir-sil");
    if (!silDugmesi) return;
    silDugmesi.closest(".satir").remove();
    donemiDogrula();
});
donemFormu.addEventListener("input", (olay) => {
    // Tek günlük tarihlerde kolaylık: başlangıç seçilince boş bitiş aynı gün olur.
    if (olay.target.dataset.alan === "baslangic") {
        const bitis = olay.target.closest(".satir").querySelector('[data-alan="bitis"]');
        if (bitis.value === "") bitis.value = olay.target.value;
    }
    // Sarı işaretli (akademik takvimden okunan) alan değiştirildiyse kontrol edilmiş sayılır.
    if (olay.target.classList.contains("emin-degil")) {
        olay.target.classList.remove("emin-degil");
        olay.target.removeAttribute("title");
    }
    donemKayitDurumu.textContent = "";
    donemiDogrula();
});
donemFormu.addEventListener("submit", (olay) => {
    olay.preventDefault();
    donemiKaydet();
});
donemSil.addEventListener("click", donemiSil);

// GPA: yazarken kart canlı güncellenir; alandan çıkınca (ya da seçim değişince) ayarlar kaydedilir.
for (const girdi of [gpaOncekiKredi, gpaOncekiGpa, gpaHedef]) {
    girdi.addEventListener("input", () => {
        gpaKayitDurumu.textContent = "";
        gpaCiz();
    });
    girdi.addEventListener("change", gpaAyarlariniKaydet);
}
donemPenceresi.querySelectorAll('input[name="kredi_birimi"]').forEach((secenek) => {
    secenek.addEventListener("change", gpaAyarlariniKaydet);
});
document.getElementById("simulasyon-sifirla").addEventListener("click", () => {
    simulasyon = {};
    gpaCiz();
});
document.getElementById("simulasyon-kaydet").addEventListener("click", simulasyonuKaydet);

// Akademik takvimden doldur
document.getElementById("takvim-doldur").addEventListener("click", takvimDoldurPenceresiniAc);
document.getElementById("takvim-doldur-kapat").addEventListener("click", () => takvimDoldurPenceresi.close());
// Pencere kapanınca süren okuma yok sayılır.
takvimDoldurPenceresi.addEventListener("close", () => { takvimOkumaNo++; });
document.getElementById("takvim-doldur-sekmeleri").addEventListener("click", (olay) => {
    const dugme = olay.target.closest("button[data-sekme]");
    if (dugme) takvimDoldurSekmesiniGoster(dugme.dataset.sekme);
});
document.getElementById("takvim-adres-formu").addEventListener("submit", (olay) => {
    olay.preventDefault();
    const adres = document.getElementById("takvim-adresi").value.trim();
    if (adres === "") {
        mesajGoster(takvimOkumaHatasi, "Bir sayfa adresi yaz.");
        return;
    }
    const veri = new FormData();
    veri.append("adres", adres);
    takvimiOku(veri);
});
document.getElementById("takvim-dosya-sec").addEventListener("click", () => takvimDosyasi.click());
takvimDosyasi.addEventListener("change", () => {
    if (takvimDosyasi.files.length > 0) takvimDosyasiniOku(takvimDosyasi.files[0]);
    takvimDosyasi.value = "";   // aynı dosya tekrar seçilebilsin
});
// Pencereye bırakılan dosyayı tarayıcı kendi açmasın (sayfadan çıkılmasın).
for (const olayAdi of ["dragover", "drop"]) {
    takvimDoldurPenceresi.addEventListener(olayAdi, (olay) => olay.preventDefault());
}
takvimBirakma.addEventListener("dragover", () => takvimBirakma.classList.add("suruklenen"));
takvimBirakma.addEventListener("dragleave", () => takvimBirakma.classList.remove("suruklenen"));
takvimBirakma.addEventListener("drop", (olay) => {
    takvimBirakma.classList.remove("suruklenen");
    const dosya = olay.dataTransfer.files[0];
    if (dosya) takvimDosyasiniOku(dosya);
});
