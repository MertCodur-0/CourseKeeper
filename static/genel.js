// Sağ paneldeki "Genel bakış" (ders seçili değilken görünen kartlar) ve zildeki bildirimler.
//
// Buradaki her şey KAYITLI VERİDEN türetilir; uydurma veri yoktur. Veri /api/ozet'ten gelir
// (dersler, dönem, yoklama, GPA ayarları) ve hesaplar için mevcut fonksiyonlar kullanılır,
// burada yeniden yazılmaz:
//   not hesabı   : notDurumunuHesapla, sonucMesaji, harfSeviyesi, hedefHarf   (uygulama.js)
//   devamsızlık  : dersYoklamasi, bekleyenYoklamalar, oturumPlanliMi ...      (yoklama.js)
//   GPA          : gpaHesapla, gpaYaz                                         (donem.js)
// uygulama.js, donem.js ve yoklama.js'ten sonra yüklenir.

const genelBakis = document.getElementById("genel-bakis");
const zil = document.getElementById("zil");
const bildirimKarti = document.getElementById("bildirim-karti");
const BILDIRIM_TERCIHI = "derstakip.bildirimOzeti";   // en son görülen bildirim kümesinin özeti
let genelBakisKaydirmasi = 0;                          // ders paneline geçerken saklanan kaydırma konumu

// Kartlarda kullanılan çizgi simgeler (satır içi SVG yolları).
const OZET_SIMGELERI = {
    takvim: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    onay: '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.3 2.5 2.5 4.9-5.3"/>',
    saat: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    sapka: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5V16c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4.5"/><path d="M21.5 9.5v4.6"/>',
    gunes: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
    bayrak: '<path d="M5.5 21V4"/><path d="M5.5 5h11l-2 3.5 2 3.5h-11"/>',
    liste: '<path d="m3.5 6.5 1.6 1.6L8 5.2"/><path d="m3.5 12.5 1.6 1.6L8 11.2"/><path d="M4 18.5h3.5"/><path d="M11.5 6.5H20.5M11.5 12.5H20.5M11.5 18.5H20.5"/>',
    kalem: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    cizgi: '<path d="m3.5 17 6-6 4 4 7-7.5"/><path d="M15 7.5h5.5V13"/>',
    halka: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/>',
    kivilcim: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.5l-1.8-5.8L4.5 10.8 10.2 9z"/><path d="M19 16.5v3M17.5 18h3"/>',
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

// Gösterilen haftadaki ders saati ve oturum sayısı. Dönem tanımlıysa sadece planlanan dersler
// (tatiller hariç) sayılır; iptal edilenler her durumda dışarıda kalır.
function haftaOzeti() {
    let saat = 0;
    let oturumSayisi = 0;
    gosterilenHafta().forEach((gun, sira) => {
        const tarih = tarihYazisi(gun);
        for (const ders of dersler) {
            for (const oturum of ders.oturumlar) {
                if (oturum.gun !== sira) continue;
                if (yoklamaVerisi.donem && !oturumPlanliMi(oturum, tarih)) continue;
                if (yoklamaDurumu(oturum.id, tarih) === "iptal") continue;
                saat += saatiSayiyaCevir(oturum.bitis) - saatiSayiyaCevir(oturum.baslangic);
                oturumSayisi += 1;
            }
        }
    });
    return { saat, oturumSayisi };
}

// Bütün derslerdeki katılım: gidilen ve gidilmeyen toplamı (devamsızlık hesabındaki havuzlardan).
function katilimOzeti() {
    let gidilen = 0;
    let gidilmeyen = 0;
    if (yoklamaVerisi.donem) {
        for (const ders of dersler) {
            for (const havuz of dersYoklamasi(ders)) {
                gidilen += havuz.gidilen;
                gidilmeyen += havuz.gidilmeyen;
            }
        }
    }
    const sayilan = gidilen + gidilmeyen;
    return { gidilen, gidilmeyen, yuzde: sayilan > 0 ? gidilen / sayilan * 100 : null };
}

// Bugün ve sonrasındaki tarihli sınav/kalemler, en yakından uzağa: [{ders, kalem, gun}]
function yaklasanKalemler() {
    const liste = [];
    for (const ders of dersler) {
        for (const kalem of ders.degerlendirmeler) {
            if (kalem.tarih && gunFarki(kalem.tarih) >= 0) liste.push({ ders, kalem, gun: gunFarki(kalem.tarih) });
        }
    }
    return liste.sort((a, b) => a.kalem.tarih.localeCompare(b.kalem.tarih)
        || (a.kalem.saat || "").localeCompare(b.kalem.saat || ""));
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

// Bugünün oturumları, saat sırasıyla; her biri o anki durumuyla.
function bugunkuOturumlar() {
    const bugun = bugunTarihi();
    const simdi = yoklamaVerisi.simdi;
    const gun = haftaninGunu(bugun);
    const liste = [];
    for (const ders of dersler) {
        for (const oturum of ders.oturumlar) {
            if (oturum.gun !== gun) continue;
            const planli = oturumPlanliMi(oturum, bugun);
            if (yoklamaVerisi.donem && !planli) continue;   // tatil ya da dönem dışı
            const kayit = yoklamaDurumu(oturum.id, bugun);
            let durum;
            if (kayit === "iptal") durum = ["İptal", "soluk"];
            else if (`${bugun}T${oturum.baslangic}` > simdi) durum = ["Sırada", "vurgu"];
            else if (`${bugun}T${oturum.bitis}` > simdi) durum = ["● Devam ediyor", "olumlu"];
            else if (planli && !kayit) durum = ["Yoklama bekliyor", "uyari"];
            else durum = ["Bitti", "soluk"];
            liste.push({ ders, oturum, durum });
        }
    }
    return liste.sort((a, b) => a.oturum.baslangic.localeCompare(b.oturum.baslangic));
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

// Bildirimlerin ve "Önerilen işler"in ortak kaynağı: o anki gerçek durumdan çıkan maddeler.
//   anahtar   : maddeyi tanıtan kısa yazı (bildirim kümesinin özeti bundan üretilir)
//   bildirim  : zilde gösterilir      oneri : "Önerilen işler"de gösterilir
function durumMaddeleri() {
    const maddeler = [];
    const bekleyen = bekleyenYoklamalar().length;
    if (bekleyen > 0) {
        maddeler.push({
            anahtar: `yoklama:${bekleyen}`, ton: "uyari", isaret: "!", bildirim: true, oneri: true,
            baslik: "Bekleyen yoklamaları doldur", aciklama: `${bekleyen} oturum bekliyor`,
            eylem: () => cubukOgesineBasildi("yoklama"),
        });
    }
    if (!yoklamaVerisi.donem && dersler.length > 0) {
        maddeler.push({
            anahtar: "donem-yok", ton: "uyari", isaret: "!", bildirim: true, oneri: true,
            baslik: "Dönem tarihlerini gir", aciklama: "Yoklama ve devamsızlık takibi için gerekli",
            eylem: () => cubukOgesineBasildi("akademik"),
        });
    }
    // 7 gün içindeki sınav ve kalemler (sadece bildirim).
    for (const { ders, kalem, gun } of yaklasanKalemler()) {
        if (gun > 7) break;
        maddeler.push({
            anahtar: `kalem:${kalem.id}`, ton: gun <= 3 ? "tehlike" : "uyari", isaret: "◆", bildirim: true, oneri: false,
            baslik: `${ders.kod} · ${turBul(kalem.tur).ad}`,
            aciklama: `${geriSayimYazisi(gun)} · ${kisaTarih(kalem.tarih)}` + (kalem.saat ? ` ${kalem.saat}` : ""),
            eylem: () => dersiAc(ders, "hesap", kalem.id),
        });
    }
    for (const ders of dersler) {
        if (!hedefHarf(ders)) {
            maddeler.push({
                anahtar: `hedef:${ders.id}`, ton: "uyari", isaret: "!", bildirim: true, oneri: true,
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
                ton: asildi ? "tehlike" : "uyari", isaret: asildi ? "✗" : "!", bildirim: true, oneri: true,
                baslik: (asildi ? "Devamsızlık sınırı aşıldı: " : "Devamsızlık sınırına yaklaşıldı: ") + etiket,
                aciklama: `Kullanılan ${ikiOndalik(havuz.gidilmeyen)} / ${ikiOndalik(havuz.limit)} ${birimAdi()}`,
                eylem: () => dersiAc(ders, "devamsizlik"),
            });
        }
    }
    // Tek kalemi kalan derslerde not hesabının kendi cümlesi (sadece öneri).
    for (const ders of dersler) {
        const mesaj = sonucMesaji(ders, notDurumunuHesapla(ders));
        if (mesaj && mesaj.tekKalem) {
            maddeler.push({
                anahtar: `gereken:${ders.id}`, ton: "bilgi", isaret: "→", bildirim: false, oneri: true,
                baslik: `${ders.kod}: ${mesaj.baslik}`, aciklama: `Hedef ${ders.hedef_not}`,
                eylem: () => dersiAc(ders, "hesap"),
            });
        }
    }
    return maddeler;
}

// Bir durum maddesinin satırı (bildirimlerde ve "Önerilen işler"de aynı görünüm).
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

// Mini rakam kartı: simge karesi + başlık, büyük değer (+ soluk birim), altında küçük açıklama.
function miniKart({ baslik, simge, kare, deger, birim, aciklama }) {
    const kart = eleman("div", "mini-kart");
    const ust = eleman("div", "mini-baslik");
    const simgeKaresi = eleman("span", `simge-karesi kucuk kare-${kare}`);
    simgeKaresi.appendChild(ozetSimgesi(simge));
    ust.append(simgeKaresi, eleman("span", "", baslik));
    const degerSatiri = eleman("div", "mini-deger");
    degerSatiri.appendChild(eleman("strong", "", deger));
    if (birim) degerSatiri.appendChild(eleman("small", "", birim));
    kart.append(ust, degerSatiri, eleman("p", "", aciklama));
    return kart;
}

function miniKartlar() {
    const izgara = eleman("div", "mini-kartlar");
    const birim = birimAdi();

    const hafta = haftaOzeti();
    izgara.appendChild(miniKart({
        baslik: "Bu hafta", simge: "takvim", kare: "kirmizi",
        deger: ikiOndalik(hafta.saat), birim: "saat", aciklama: `${hafta.oturumSayisi} oturum`,
    }));

    const katilim = katilimOzeti();
    izgara.appendChild(miniKart(katilim.yuzde === null
        ? { baslik: "Katılım", simge: "onay", kare: "yesil", deger: "—", aciklama: "Henüz veri yok" }
        : {
            baslik: "Katılım", simge: "onay", kare: "yesil",
            deger: `%${Math.round(katilim.yuzde * 10) / 10}`,
            aciklama: `${ikiOndalik(katilim.gidilen)} ${birim} gidildi · ${ikiOndalik(katilim.gidilmeyen)} ${birim} gidilmedi`,
        }));

    const sonraki = yaklasanKalemler()[0];
    izgara.appendChild(miniKart(sonraki
        ? {
            baslik: "Sonraki sınav", simge: "saat", kare: "mor",
            deger: sonraki.gun === 0 ? "Bugün" : String(sonraki.gun), birim: sonraki.gun === 0 ? "" : "gün",
            aciklama: `${sonraki.ders.kod} · ${turBul(sonraki.kalem.tur).ad}`,
        }
        : { baslik: "Sonraki sınav", simge: "saat", kare: "mor", deger: "—", aciklama: "Tarihli sınav yok" }));

    const donem = donemDurumu();
    let donemMini = { baslik: "Dönem", simge: "sapka", kare: "mavi", deger: "—", aciklama: "Dönem tanımlı değil" };
    if (donem && (!donem.basladi || donem.bitti)) {
        donemMini.aciklama = donemBilgisi(bugunTarihi()).yazi;   // "Dönem 5 Ekim'de başlıyor" / "Dönem bitti"
    } else if (donem) {
        const finalVar = Boolean(donem.donem.final_baslangic);
        const kalan = gunFarki(finalVar ? donem.donem.final_baslangic : donem.donem.bitis);
        donemMini.deger = `${donem.hafta}.`;
        donemMini.birim = "hafta";
        donemMini.aciklama = finalVar
            ? (kalan > 0 ? `Final'e ${kalan} gün` : "Final dönemi başladı")
            : `Dönem sonuna ${kalan} gün`;
    }
    izgara.appendChild(miniKart(donemMini));
    return izgara;
}

function bugunKarti() {
    const oturumlar = bugunkuOturumlar();
    const { kart, govde } = ozetKarti({
        baslik: "Bugün", simge: "gunes", kare: "mor", ton: "bilgi",
        rozet: hapRozet(oturumlar.length > 0 ? `${oturumlar.length} ders` : "Ders yok"),
    });
    if (oturumlar.length === 0) govde.appendChild(bosSatir("Bugün ders yok", true));
    for (const { ders, oturum, durum } of oturumlar) {
        govde.appendChild(icSatir({
            sol: dersKaresi(ders), baslik: ders.kod,
            aciklama: `${oturum.baslangic}-${oturum.bitis} · ${oturum.derslik}`,
            sag: hapRozet(durum[0], durum[1]),
            eylem: () => dersiAc(ders),
        }));
    }
    return kart;
}

function yaklasanKarti() {
    const kalemler = yaklasanKalemler().filter((satir) => satir.gun <= 14);
    const { kart, govde } = ozetKarti({
        baslik: "Yaklaşan", simge: "bayrak", kare: "kirmizi", ton: "tehlike", rozet: hapRozet("14 gün", "tehlike"),
    });
    if (kalemler.length === 0) govde.appendChild(bosSatir("Önümüzdeki 14 günde sınav yok"));
    for (const { ders, kalem, gun } of kalemler.slice(0, 5)) {
        govde.appendChild(icSatir({
            sol: dersKaresi(ders), baslik: `${ders.kod} · ${turBul(kalem.tur).ad}`,
            aciklama: kisaTarih(kalem.tarih) + (kalem.saat ? ` · ${kalem.saat}` : ""),
            // 3 gün ve altı kırmızı, 7 gün ve altı sarı.
            sag: hapRozet(geriSayimYazisi(gun), gun <= 3 ? "tehlike" : gun <= 7 ? "uyari" : "soluk"),
            eylem: () => dersiAc(ders, "hesap", kalem.id),
        }));
    }
    if (kalemler.length > 5) govde.appendChild(eleman("p", "kucuk-not", `+${kalemler.length - 5} daha`));
    return kart;
}

function devamsizlikKarti() {
    if (!yoklamaVerisi.donem) {
        const { kart, govde } = ozetKarti({ baslik: "Devamsızlık", simge: "liste", kare: "turkuaz", ton: "turkuaz" });
        govde.appendChild(icSatir({
            baslik: "Dönem tarihlerini gir", aciklama: "Devamsızlık dönem tarihlerine göre hesaplanır",
            eylem: () => cubukOgesineBasildi("akademik"),
        }));
        return kart;
    }
    const ozet = devamsizlikOzeti();
    const rozetler = { guvende: ["Güvende", "olumlu"], dikkat: ["Dikkat", "uyari"], asildi: ["Sınır aşıldı", "tehlike"] };
    const { kart, govde } = ozetKarti({
        baslik: "Devamsızlık", simge: "liste", kare: "turkuaz", ton: "turkuaz",
        rozet: ozet.satirlar.length > 0 ? hapRozet(...rozetler[ozet.genel]) : null,
    });
    if (ozet.satirlar.length === 0) govde.appendChild(bosSatir("Henüz ders eklenmemiş"));
    const tonlar = { yesil: "olumlu", sari: "uyari", kirmizi: "tehlike" };
    for (const { ders, havuz, etiket } of ozet.satirlar) {
        govde.appendChild(etiketDeger(havuz.limit === null
            ? { etiket, deger: "Limit girilmemiş", ton: "soluk", eylem: () => dersiAc(ders, "devamsizlik") }
            : {
                etiket, deger: `${ikiOndalik(havuz.gidilmeyen)} / ${ikiOndalik(havuz.limit)} ${birimAdi()}`,
                ton: tonlar[havuz.renk], eylem: () => dersiAc(ders, "devamsizlik"),
            }));
    }
    return kart;
}

function notlarKarti() {
    const { kart, govde } = ozetKarti({
        baslik: "Notlar", simge: "kalem", kare: "mor", ton: "bilgi", rozet: hapRozet(`${dersler.length} ders`),
    });
    if (dersler.length === 0) govde.appendChild(bosSatir("Henüz ders eklenmemiş"));
    for (const ders of dersler) {
        const durum = notDurumunuHesapla(ders);
        const hedef = hedefHarf(ders);
        let deger = "Puan girilmedi";
        let ton = "soluk";
        if (durum.girilenVar) {
            // Not hesabı sekmesindekiyle aynı toplam ve harf; sonuç da aynı fonksiyondan.
            deger = `${ikiOndalik(durum.kazanilan)} puan · ${harfSeviyesi(durum.kazanilan).harf}`
                + ` → ${hedef ? hedef.harf : "?"}`;
            const mesaj = sonucMesaji(ders, durum);
            if (!hedef) ton = "soluk";
            else if (mesaj === null) { ton = "olumlu"; deger = `✓ ${deger}`; }
            else ton = mesaj.ulasilamaz ? "tehlike" : "uyari";
        }
        govde.appendChild(etiketDeger({ etiket: ders.kod, deger, ton, eylem: () => dersiAc(ders, "hesap") }));
    }
    return kart;
}

function gpaKarti() {
    // GPA ekranındaki hesabın aynısı (gpaHesapla); harf olarak derse kayıtlı hedef kullanılır.
    const sonuc = gpaHesapla(gpaAyarlari, hedefHarf);
    if (!sonuc || sonuc.yeniGpa === undefined) {
        const { kart, govde } = ozetKarti({ baslik: "GPA", simge: "cizgi", kare: "mor", ton: "bilgi" });
        govde.appendChild(icSatir({
            baslik: "GPA bilgilerini gir", aciklama: "Önceki kredi, önceki GPA ve derslerin hedef harfleri gerekli",
            eylem: () => cubukOgesineBasildi("gpa"),
        }));
        return kart;
    }
    let rozet = null;
    if (sonuc.hedefGpa !== undefined) {
        rozet = sonuc.yeniGpa >= sonuc.hedefGpa ? hapRozet("Hedefte ✓", "olumlu") : hapRozet("Hedefin altında", "uyari");
    }
    const { kart, govde } = ozetKarti({ baslik: "GPA", simge: "cizgi", kare: "mor", ton: "bilgi", rozet });
    const buyuk = eleman("div", "buyuk-deger");
    buyuk.append(eleman("strong", "", gpaYaz(sonuc.yeniGpa)), eleman("small", "", "Yeni genel GPA"));
    govde.appendChild(tiklanabilirYap(buyuk, () => cubukOgesineBasildi("gpa")));
    govde.appendChild(etiketDeger({ etiket: "Mevcut GPA", deger: sonuc.oncekiGpa === null ? "— (ilk dönem)" : gpaYaz(sonuc.oncekiGpa) }));
    govde.appendChild(etiketDeger({ etiket: "Bu dönem tahmini", deger: gpaYaz(sonuc.donemGpa) }));
    govde.appendChild(etiketDeger({ etiket: "Toplam kredi", deger: `${ikiOndalik(sonuc.oncekiKredi)} → ${ikiOndalik(sonuc.toplamKredi)}` }));
    govde.appendChild(etiketDeger({ etiket: "Hedef GPA", deger: sonuc.hedefGpa === undefined ? "—" : gpaYaz(sonuc.hedefGpa) }));
    return kart;
}

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

function onerilerKarti(maddeler) {
    const oneriler = maddeler.filter((madde) => madde.oneri).slice(0, 6);
    const { kart, govde } = ozetKarti({
        baslik: "Önerilen işler", simge: "kivilcim", kare: "turkuaz", ton: "turkuaz",
        rozet: oneriler.length > 0 ? hapRozet(String(oneriler.length), "soluk") : null,
    });
    if (oneriler.length === 0) govde.appendChild(bosSatir("Her şey yolunda", true));
    for (const madde of oneriler) govde.appendChild(maddeSatiri(madde));
    return kart;
}

// ============================================================
// GENEL BAKIŞI ÇİZME
// ============================================================

// Bütün kartları kayıtlı veriden baştan çizer; kaydırma konumu korunur. Bildirimleri de günceller.
// Veri ya da gösterilen hafta her değiştiğinde çağrılır (takvimiCiz'in sonunda, ayrıca 5 dakikada bir).
function genelBakisiCiz() {
    const gorunur = !genelBakis.hidden;
    if (gorunur) genelBakisKaydirmasi = genelBakis.scrollTop;
    const maddeler = durumMaddeleri();
    genelBakis.replaceChildren(
        miniKartlar(), bugunKarti(), yaklasanKarti(), devamsizlikKarti(), notlarKarti(),
        gpaKarti(), donemKarti(), onerilerKarti(maddeler),
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
