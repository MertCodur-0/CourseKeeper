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
    donemPenceresi.showModal();
    gpaCiz();
}

// Kapatmadan önce: akademik takvimde kaydedilmemiş değişiklik varsa onay ister.
function donemEkraniniKapat() {
    const degisti = JSON.stringify(donemFormunuOku()) !== donemAnlik;
    if (degisti && !confirm("Akademik takvimde kaydedilmemiş değişiklikler var. Yine de kapatılsın mı?")) return;
    donemPenceresi.close();
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

// Ders yapılmayan tarihler listesine bir satır ekler.
function dersDisiSatiriEkle(veri = {}) {
    const satir = document.getElementById("ders-disi-sablonu").content.firstElementChild.cloneNode(true);
    satir.querySelectorAll("[data-alan]").forEach((alan) => {
        if (veri[alan.dataset.alan] != null) alan.value = veri[alan.dataset.alan];
    });
    dersDisiListesi.appendChild(satir);
}

// Formu sunucudan gelen dönemle doldurur (dönem yoksa boş form).
function donemFormunuDoldur(veri) {
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
    } catch (hata) {
        mesajGoster(donemHatasi, hata.message);
    }
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

document.getElementById("donem-dugmesi").addEventListener("click", donemEkraniniAc);
document.getElementById("donem-kapat").addEventListener("click", donemEkraniniKapat);
// Esc: tarayıcı pencereyi kendisi kapatmasın, önce kaydedilmemiş değişiklik sorulsun.
donemPenceresi.addEventListener("cancel", (olay) => {
    olay.preventDefault();
    donemEkraniniKapat();
});
// Pencerenin dışına (arkadaki karartılmış alana) tıklanınca kapat.
donemPenceresi.addEventListener("click", (olay) => {
    if (olay.target === donemPenceresi) donemEkraniniKapat();
});
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
