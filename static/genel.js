// Sağ paneldeki "Genel bakış" (ders seçili değilken görünen kartlar) ve zildeki bildirimler.
//
// Genel bakışta yalnızca üç kart vardır: Sonraki sınav, Dönem ilerlemesi ve Hava durumu
// (hava durumu kartı static/hava.js'te). Aynı bilgi ikinci bir kartta tekrar gösterilmez.
// Buradaki her şey KAYITLI VERİDEN türetilir; uydurma veri yoktur. Veri /api/ozet'ten gelir;
// devamsızlık ve yoklama hesapları için mevcut fonksiyonlar kullanılır (dersYoklamasi,
// bekleyenYoklamalar; yoklama.js). uygulama.js, donem.js ve yoklama.js'ten sonra yüklenir.

const genelBakis = document.getElementById("genel-bakis");
const zil = document.getElementById("zil");
const bildirimKarti = document.getElementById("bildirim-karti");
const BILDIRIM_TERCIHI = "derstakip.bildirimOzeti";   // en son görülen bildirim kümesinin özeti
let genelBakisKaydirmasi = 0;                          // ders paneline geçerken saklanan kaydırma konumu

// Kartlarda kullanılan çizgi simgeler (satır içi SVG yolları).
const OZET_SIMGELERI = {
    kalem: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    halka: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/>',
    // Ders panelinin kartları (static/uygulama.js, static/yoklama.js)
    hesap: '<path d="M4 5v14h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/>',
    liste: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4.5 6h.01"/><path d="M4.5 12h.01"/><path d="M4.5 18h.01"/>',
    katilim: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="m16 11 2 2 4-4"/>',
    gecmis: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bilgi: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    takvim: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16"/><path d="M8 3v4"/><path d="M16 3v4"/>',
};

function ozetSimgesi(ad) {
    const kap = document.createElement("span");
    kap.innerHTML = `<svg class="simge" viewBox="0 0 24 24" aria-hidden="true">${OZET_SIMGELERI[ad]}</svg>`;
    return kap.firstElementChild;
}

// ============================================================
// KÜÇÜK YARDIMCILAR
// ============================================================

function bugunTarihi() {
    return yoklamaVerisi.simdi.slice(0, 10);
}

// İki tarih arasındaki gün farkı (tarih - bugün): 0 bugün, 1 yarın.
function gunFarki(tarih) {
    return gunNumarasi(tarih) - gunNumarasi(bugunTarihi());
}

// "Bugün", "Yarın", "5 gün"
function geriSayimYazisi(gun) {
    if (gun === 0) return "Bugün";
    if (gun === 1) return "Yarın";
    return `${gun} gün`;
}

// "2026-10-17" -> "17 Ekim"
function kisaTarih(tarih) {
    const [, ay, gun] = tarih.split("-").map(Number);
    return `${gun} ${AY_ADLARI[ay - 1]}`;
}

// Dersin panelini belirli bir sekmede açar (kalemId verilirse o satır vurgulanır).
function dersiAc(ders, sekme, kalemId = null) {
    dersPaneliniAc(ders, kalemId);
    if (sekme) sekmeyiGoster(sekme);
}

// Bir satırı tıklanabilir yapar: fare, Enter ve Boşluk aynı işi görür; klavyeyle odaklanılabilir.
function tiklanabilirYap(satir, eylem) {
    satir.classList.add("tiklanabilir");
    satir.tabIndex = 0;
    satir.setAttribute("role", "button");
    satir.addEventListener("click", eylem);
    satir.addEventListener("keydown", (olay) => {
        if (olay.key !== "Enter" && olay.key !== " ") return;
        olay.preventDefault();
        eylem();
    });
    return satir;
}

// Hap rozet. ton: "olumlu", "uyari", "tehlike", "vurgu", "soluk" ya da boş (bilgi).
function hapRozet(yazi, ton = "") {
    return eleman("span", `hap ${ton}`.trim(), yazi);
}

// Tonlu kart: başlıkta renkli simge karesi ve (varsa) sağda hap rozet. { kart, govde } döner.
function ozetKarti({ baslik, simge, kare, ton, rozet }) {
    const kart = eleman("section", `ozet-karti tonlu ton-${ton}`);
    const ust = eleman("header", "ozet-basligi");
    const simgeKaresi = eleman("span", `simge-karesi kare-${kare}`);
    simgeKaresi.appendChild(ozetSimgesi(simge));
    ust.append(simgeKaresi, eleman("h3", "", baslik));
    if (rozet) ust.appendChild(rozet);
    const govde = eleman("div", "ozet-govdesi");
    kart.append(ust, govde);
    return { kart, govde };
}

// İç satır: solda (isteğe bağlı) bir işaret, ortada başlık + soluk açıklama, sağda (isteğe bağlı) çip.
function icSatir({ sol, baslik, aciklama, sag, eylem }) {
    const satir = eleman("div", "ic-satir");
    if (sol) satir.appendChild(sol);
    const yazi = eleman("div", "ic-satir-yazisi");
    yazi.appendChild(eleman("strong", "", baslik));
    if (aciklama) yazi.appendChild(eleman("small", "", aciklama));
    satir.appendChild(yazi);
    if (sag) satir.appendChild(sag);
    return eylem ? tiklanabilirYap(satir, eylem) : satir;
}

// "Etiket solda, değer sağda" satırı. ton: değerin rengi.
function etiketDeger({ etiket, deger, ton = "", eylem }) {
    const satir = eleman("div", "ed-satiri");
    satir.append(eleman("span", "ed-etiket", etiket), eleman("span", `ed-deger ${ton}`.trim(), deger));
    return eylem ? tiklanabilirYap(satir, eylem) : satir;
}

// Dersin rengini taşıyan küçük kare.
function dersKaresi(ders) {
    const kare = eleman("span", "ders-karesi");
    kare.style.background = renkBul(ders.renk).kod;
    return kare;
}

// ============================================================
// TÜRETİLMİŞ VERİLER (hepsi kayıtlı veriden; hesaplar mevcut fonksiyonlarla)
// ============================================================

// Yaklaşan tarihli sınav/kalemler, en yakından uzağa: [{ders, kalem, gun}].
// Bugün dahildir; saati olan bugünkü kalem, saati geçtiyse sayılmaz. Tarihi geçmişler sayılmaz.
// Aynı günde saati erken olan öne gelir; saatsizler o günün sonuna.
function yaklasanKalemler() {
    const simdikiSaat = yoklamaVerisi.simdi.slice(11, 16);
    const liste = [];
    for (const ders of dersler) {
        for (const kalem of ders.degerlendirmeler) {
            if (!kalem.tarih) continue;
            const gun = gunFarki(kalem.tarih);
            if (gun < 0 || (gun === 0 && kalem.saat && kalem.saat < simdikiSaat)) continue;
            liste.push({ ders, kalem, gun });
        }
    }
    return liste.sort((a, b) => a.kalem.tarih.localeCompare(b.kalem.tarih)
        || (a.kalem.saat || "99:99").localeCompare(b.kalem.saat || "99:99"));
}

// Dönemin durumu (dönem tanımlı değilse null).
function donemDurumu() {
    const donem = yoklamaVerisi.donem;
    if (!donem) return null;
    const bugun = bugunTarihi();
    const ilk = gunNumarasi(donem.baslangic);
    const son = gunNumarasi(donem.bitis);
    const simdiki = gunNumarasi(bugun);
    const gunSayisi = son - ilk + 1;
    const gecenGun = Math.min(Math.max(simdiki - ilk + 1, 0), gunSayisi);
    let dersDisi = 0;
    for (const gun of dersDisiGunler) if (gun >= ilk && gun <= son) dersDisi += 1;
    return {
        donem,
        basladi: bugun >= donem.baslangic,
        bitti: bugun > donem.bitis,
        hafta: Math.floor((simdiki - ilk) / 7) + 1,
        toplamHafta: Math.ceil(gunSayisi / 7),
        yuzde: Math.round(gecenGun / gunSayisi * 100),
        dersDisi,
    };
}

// Devamsızlık satırları: her ders (lab ayrıysa her havuz) için kullanılan / limit ve durum.
// Genel durum en kötü satıra göredir: "asildi" > "dikkat" > "guvende".
function devamsizlikOzeti() {
    const satirlar = [];
    let genel = "guvende";
    for (const ders of dersler) {
        const havuzlar = dersYoklamasi(ders);
        for (const havuz of havuzlar) {
            const etiket = havuzlar.length > 1 ? `${ders.kod} · ${havuz.ad}` : ders.kod;
            if (havuz.limit !== null) {
                if (havuz.kalanHak < 0) genel = "asildi";
                else if (havuz.renk !== "yesil" && genel !== "asildi") genel = "dikkat";
            }
            satirlar.push({ ders, havuz, etiket });
        }
    }
    return { satirlar, genel };
}

// Bildirimlerin kaynağı: o anki gerçek durumdan çıkan maddeler.
//   anahtar : maddeyi tanıtan kısa yazı (bildirim kümesinin özeti bundan üretilir)
function durumMaddeleri() {
    const maddeler = [];
    const bekleyen = bekleyenYoklamalar().length;
    if (bekleyen > 0) {
        maddeler.push({
            anahtar: `yoklama:${bekleyen}`, ton: "uyari", isaret: "!",
            baslik: "Bekleyen yoklamaları doldur", aciklama: `${bekleyen} oturum bekliyor`,
            eylem: () => cubukOgesineBasildi("yoklama"),
        });
    }
    if (!yoklamaVerisi.donem && dersler.length > 0) {
        maddeler.push({
            anahtar: "donem-yok", ton: "uyari", isaret: "!",
            baslik: "Dönem tarihlerini gir", aciklama: "Yoklama ve devamsızlık takibi için gerekli",
            eylem: () => cubukOgesineBasildi("akademik"),
        });
    }
    // 7 gün içindeki sınav ve kalemler.
    for (const { ders, kalem, gun } of yaklasanKalemler()) {
        if (gun > 7) break;
        maddeler.push({
            anahtar: `kalem:${kalem.id}`, ton: gun <= 3 ? "tehlike" : "uyari", isaret: "◆",
            baslik: `${ders.kod} · ${turBul(kalem.tur).ad}`,
            aciklama: `${geriSayimYazisi(gun)} · ${kisaTarih(kalem.tarih)}` + (kalem.saat ? ` ${kalem.saat}` : ""),
            eylem: () => dersiAc(ders, "hesap", kalem.id),
        });
    }
    for (const ders of dersler) {
        if (!hedefHarf(ders)) {
            maddeler.push({
                anahtar: `hedef:${ders.id}`, ton: "uyari", isaret: "!",
                baslik: `Hedef harf notu eksik: ${ders.kod}`, aciklama: "Dersi düzenleyip hedefini seç",
                eylem: () => dersFormunuAc(ders),
            });
        }
    }
    // Devamsızlık: en az bir devamsızlığı olan ve sınıra yaklaşmış ya da sınırı aşmış havuzlar.
    if (yoklamaVerisi.donem) {
        for (const { ders, havuz, etiket } of devamsizlikOzeti().satirlar) {
            if (havuz.limit === null || havuz.gidilmeyen <= 0 || havuz.renk === "yesil") continue;
            const asildi = havuz.kalanHak < 0;
            maddeler.push({
                anahtar: `devamsizlik:${ders.id}:${havuz.ad}:${asildi ? "asildi" : "yakin"}`,
                ton: asildi ? "tehlike" : "uyari", isaret: asildi ? "✗" : "!",
                baslik: (asildi ? "Devamsızlık sınırı aşıldı: " : "Devamsızlık sınırına yaklaşıldı: ") + etiket,
                aciklama: `Kullanılan ${ikiOndalik(havuz.gidilmeyen)} / ${ikiOndalik(havuz.limit)} ${birimAdi()}`,
                eylem: () => dersiAc(ders, "devamsizlik"),
            });
        }
    }
    return maddeler;
}

// Bir bildirimin satırı.
function maddeSatiri(madde) {
    const isaret = eleman("span", `madde-isareti ${madde.ton}`, madde.isaret);
    isaret.setAttribute("aria-hidden", "true");
    return icSatir({ sol: isaret, baslik: madde.baslik, aciklama: madde.aciklama, eylem: madde.eylem });
}

function bosSatir(yazi, onayli = false) {
    return eleman("div", "ic-satir bos", (onayli ? "✓ " : "") + yazi);
}

// ============================================================
// KARTLAR
// ============================================================

function donemKarti() {
    const ozet = donemDurumu();
    const { kart, govde } = ozetKarti({ baslik: "Dönem ilerlemesi", simge: "halka", kare: "mavi", ton: "mavi" });
    if (!ozet) {
        govde.appendChild(icSatir({
            baslik: "Dönem tarihlerini gir", aciklama: "Derslerin ilk ve son günü, tatiller",
            eylem: () => cubukOgesineBasildi("akademik"),
        }));
        return kart;
    }
    // Halka: geçen takvim günü / toplam gün.
    const cevre = 2 * Math.PI * 26;
    const halka = eleman("div", "ilerleme-halkasi");
    halka.innerHTML = `<svg viewBox="0 0 64 64" role="img" aria-label="Dönemin yüzde ${ozet.yuzde} kadarı geçti">
        <circle class="halka-zemin" cx="32" cy="32" r="26"/>
        <circle class="halka-dolu" cx="32" cy="32" r="26" stroke-dasharray="${cevre}" stroke-dashoffset="${cevre * (1 - ozet.yuzde / 100)}"/>
    </svg>`;
    halka.appendChild(eleman("strong", "", `%${ozet.yuzde}`));

    const satirlar = eleman("div", "halka-satirlari");
    const hafta = !ozet.basladi ? "Başlamadı" : ozet.bitti ? "Bitti" : `${ozet.hafta} / ${ozet.toplamHafta}`;
    satirlar.appendChild(etiketDeger({ etiket: "Hafta", deger: hafta }));
    satirlar.appendChild(etiketDeger({ etiket: "Derslerin son günü", deger: tarihiGoster(ozet.donem.bitis) }));
    if (ozet.donem.final_baslangic) {
        satirlar.appendChild(etiketDeger({
            etiket: "Final",
            deger: kisaTarih(ozet.donem.final_baslangic) + (ozet.donem.final_bitis ? ` – ${kisaTarih(ozet.donem.final_bitis)}` : ""),
        }));
    }
    satirlar.appendChild(etiketDeger({ etiket: "Ders yapılmayan", deger: `${ozet.dersDisi} gün` }));

    const duzen = eleman("div", "halka-duzeni");
    duzen.append(halka, satirlar);
    govde.appendChild(tiklanabilirYap(duzen, () => cubukOgesineBasildi("akademik")));
    return kart;
}


// "Sonraki sınav" kartı: Dönem ilerlemesiyle aynı düzen (solda halka, sağda etiket-değer satırları).
// Halka, sınava 30 gün kala dolmaya başlar ve sınav günü tamamen dolar; ortasında kalan gün yazar.
// Ton aciliyete göre değişir (8+ gün mor, 4-7 gün amber, 0-3 gün kırmızı); kalan gün her zaman
// yazıyla da görünür.
const SINAV_UFKU = 30;   // gün

function sinavKarti() {
    const kalemler = yaklasanKalemler();
    const sonraki = kalemler[0];
    const cevre = 2 * Math.PI * 26;

    // Halkayı (ve ortasındaki yazıyı) hazırlar. doluluk: 0-1.
    function halkaOlustur(doluluk, buyukYazi, kucukYazi, etiket) {
        const halka = eleman("div", "ilerleme-halkasi tonlu-halka");
        halka.innerHTML = `<svg viewBox="0 0 64 64" role="img" aria-label="${etiket}">
            <circle class="halka-zemin" cx="32" cy="32" r="26"/>
            <circle class="halka-dolu" cx="32" cy="32" r="26" stroke-dasharray="${cevre}" stroke-dashoffset="${cevre * (1 - doluluk)}"/>
        </svg>`;
        const orta = eleman("strong", kucukYazi ? "iki-satir" : "");
        orta.appendChild(eleman("span", "", buyukYazi));
        if (kucukYazi) orta.appendChild(eleman("small", "", kucukYazi));
        halka.appendChild(orta);
        return halka;
    }

    // Boş durum: tarihli sınav yok.
    if (!sonraki) {
        const { kart, govde } = ozetKarti({ baslik: "Sonraki sınav", simge: "kalem", kare: "mor", ton: "bilgi" });
        const yazi = eleman("div", "halka-satirlari");
        yazi.append(eleman("strong", "", "Yaklaşan tarihli sınav yok"),
            eleman("p", "kucuk-not", "Sınav tarihlerini ders formundan girebilirsin"));
        const duzen = eleman("div", "halka-duzeni");
        duzen.append(halkaOlustur(0, "✓", "", "Yaklaşan tarihli sınav yok"), yazi);
        govde.appendChild(duzen);
        return kart;
    }

    const { ders, kalem, gun } = sonraki;
    const ton = gun <= 3 ? "tehlike" : gun <= 7 ? "uyari" : "bilgi";
    const { kart, govde } = ozetKarti({
        baslik: "Sonraki sınav", simge: "kalem", kare: "mor", ton,
        rozet: hapRozet(turBul(kalem.tur).ad, ton === "bilgi" ? "" : ton),
    });

    const doluluk = Math.min(Math.max(1 - gun / SINAV_UFKU, 0), 1);
    const geriSayim = geriSayimYazisi(gun);   // "Bugün", "Yarın" ya da "5 gün"
    const halka = gun <= 1
        ? halkaOlustur(doluluk, geriSayim, "", `Sınav ${geriSayim.toLocaleLowerCase("tr")}`)
        : halkaOlustur(doluluk, String(gun), "gün", `Sınava ${gun} gün kaldı`);

    const [yil, ay, ayinGunu] = kalem.tarih.split("-").map(Number);
    const tarih = `${ayinGunu} ${AY_KISALTMALARI[ay - 1]}, ${AYARLAR.gunler[haftaninGunu(kalem.tarih)]}`
        + (yil !== Number(bugunTarihi().slice(0, 4)) ? ` ${yil}` : "");
    const saat = !kalem.saat ? "Belirtilmedi" : kalem.saat + (kalem.bitis_saat ? ` – ${kalem.bitis_saat}` : "");

    const satirlar = eleman("div", "halka-satirlari");
    satirlar.appendChild(etiketDeger({ etiket: "Ders", deger: ders.kod }));
    satirlar.appendChild(etiketDeger({ etiket: "Tarih", deger: tarih }));
    satirlar.appendChild(etiketDeger({ etiket: "Saat", deger: saat, ton: kalem.saat ? "" : "soluk" }));
    satirlar.appendChild(etiketDeger({ etiket: "Ağırlık", deger: `%${kalem.agirlik}` }));

    const duzen = eleman("div", "halka-duzeni");
    duzen.append(halka, satirlar);
    // Karta tıklayınca dersin "Not hesabı" sekmesi, bu kalemin satırı vurgulanarak açılır.
    govde.appendChild(tiklanabilirYap(duzen, () => dersiAc(ders, "hesap", kalem.id)));

    const ayniGun = kalemler.filter((satir) => satir.kalem.tarih === kalem.tarih).length - 1;
    if (ayniGun > 0) govde.appendChild(eleman("p", "kucuk-not", `+${ayniGun} sınav daha aynı gün`));
    return kart;
}

// ============================================================
// GENEL BAKIŞI ÇİZME
// ============================================================

// Üç kartı baştan çizer (Sonraki sınav, Dönem ilerlemesi, Hava durumu); kaydırma konumu korunur.
// Bildirimleri de günceller. Hava durumu kartı elindeki son veriyi çizer, burada yeni istek atılmaz.
// Veri her değiştiğinde çağrılır (takvimiCiz'in sonunda, ayrıca 5 dakikada bir).
function genelBakisiCiz() {
    const gorunur = !genelBakis.hidden;
    if (gorunur) genelBakisKaydirmasi = genelBakis.scrollTop;
    const maddeler = durumMaddeleri();
    genelBakis.replaceChildren(
        sinavKarti(), donemKarti(), havaKarti(),
        eleman("p", "genel-ipucu", "Ayrıntı için takvimde bir derse tıkla"),
    );
    if (gorunur) genelBakis.scrollTop = genelBakisKaydirmasi;
    bildirimleriGuncelle(maddeler);
}

// Ders paneline geçmeden önce çağrılır: geri dönünce kaldığı yerden devam etsin.
function genelBakisKonumunuSakla() {
    if (!genelBakis.hidden) genelBakisKaydirmasi = genelBakis.scrollTop;
}

// Ders panelinden "Genel bakış"a döner ("← Genel bakış", × ya da seçili ders silinince).
function genelBakisaDon() {
    panelGorunumunuGoster("genel");
    genelBakisiCiz();
    genelBakis.scrollTop = genelBakisKaydirmasi;
}

// ============================================================
// BİLDİRİMLER (zil)
// Bildirimler saklanmaz; her seferinde o anki durumdan türetilir. "Okundu" bilgisi olarak sadece
// en son görülen bildirim kümesinin kısa bir özeti tarayıcıda tutulur: küme değişince (yeni bir
// bildirim çıkınca) zildeki kırmızı nokta yeniden görünür.
// ============================================================

let sonBildirimler = [];

// Bildirim kümesinin kısa özeti (anahtarlardan basit bir sağlama toplamı).
function bildirimOzeti(bildirimler) {
    const yazi = bildirimler.map((madde) => madde.anahtar).sort().join("|");
    let toplam = 5381;
    for (let i = 0; i < yazi.length; i++) toplam = (toplam * 33 + yazi.charCodeAt(i)) >>> 0;
    return `${bildirimler.length}:${toplam.toString(36)}`;
}

function bildirimleriGuncelle(maddeler) {
    sonBildirimler = maddeler.filter((madde) => madde.bildirim);
    const okunmamis = sonBildirimler.length > 0 && bildirimOzeti(sonBildirimler) !== tercihOku(BILDIRIM_TERCIHI);
    document.querySelectorAll("[data-bildirim-noktasi]").forEach((nokta) => { nokta.hidden = !okunmamis; });
    const etiket = okunmamis ? `Bildirimler (${sonBildirimler.length} yeni)` : "Bildirimler";
    zil.setAttribute("aria-label", etiket);
    if (!bildirimKarti.hidden) bildirimKartiniCiz();
}

function bildirimKartiniCiz() {
    bildirimKarti.replaceChildren();
    const ust = eleman("header", "ozet-basligi");
    ust.append(eleman("h3", "", "Bildirimler"), hapRozet(String(sonBildirimler.length), sonBildirimler.length > 0 ? "uyari" : "soluk"));
    bildirimKarti.appendChild(ust);
    const govde = eleman("div", "ozet-govdesi");
    if (sonBildirimler.length === 0) govde.appendChild(bosSatir("Her şey yolunda", true));
    for (const madde of sonBildirimler) {
        // Bir bildirime gidilince kart kapanır.
        govde.appendChild(maddeSatiri({ ...madde, eylem: () => { bildirimKartiniKapat(); madde.eylem(); } }));
    }
    bildirimKarti.appendChild(govde);
}

// Kartı zilin altında açar; açılınca mevcut küme "okundu" sayılır ve nokta kaybolur.
function bildirimKartiniAc() {
    bildirimKartiniCiz();
    bildirimKarti.hidden = false;
    zil.setAttribute("aria-expanded", "true");
    tercihYaz(BILDIRIM_TERCIHI, bildirimOzeti(sonBildirimler));
    document.querySelectorAll("[data-bildirim-noktasi]").forEach((nokta) => { nokta.hidden = true; });
    zil.setAttribute("aria-label", "Bildirimler");
    (bildirimKarti.querySelector(".tiklanabilir") || zil).focus();
}

function bildirimKartiniKapat() {
    if (bildirimKarti.hidden) return false;
    bildirimKarti.hidden = true;
    zil.setAttribute("aria-expanded", "false");
    return true;
}

function bildirimKartiniAcKapat() {
    if (!bildirimKartiniKapat()) bildirimKartiniAc();
}

zil.addEventListener("click", bildirimKartiniAcKapat);
// Kartın dışına tıklanınca kapanır (zilin kendisi ve sol çubuktaki "Bildirimler" öğesi hariç:
// onlar zaten açıp kapatır).
document.addEventListener("click", (olay) => {
    if (bildirimKarti.hidden) return;
    if (olay.target.closest(".zil-alani") || olay.target.closest('[data-oge="bildirimler"]')) return;
    bildirimKartiniKapat();
});
