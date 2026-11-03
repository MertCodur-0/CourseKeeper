// Tarayıcı tarafındaki hesapların testleri: ders puanı ve hedef mesajı, harf seviyesi, GPA, devamsızlık.
//
// Çalıştırma (proje klasöründe): node --test tests/
// Harici paket gerekmez. static/ altındaki dosyalar sahte bir sayfa içinde yüklenir (sayfadaki
// parçalar "her şeyi kabul eden" boş bir nesneyle taklit edilir) ve hesap fonksiyonları doğrudan çağrılır.
// Ayarlar (not ölçeği, yoklama ayarları...) app.py'den alınır, testte ayrı bir kopyası yoktur.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const PROJE = path.join(__dirname, "..");

// Sayfanın JavaScript'e verdiği AYARLAR nesnesi (app.py: ana_sayfa) ile aynı değerler.
function ayarlariAl() {
    const python = fs.existsSync(path.join(PROJE, "venv/bin/python")) ? path.join(PROJE, "venv/bin/python") : "python3";
    const kod = `
import json, app
with app.app.test_request_context():
    print(json.dumps({
        "notOlcegi": app.NOT_OLCEGI, "eskiNotlar": app.ESKI_NOTLAR,
        "yuzUzerindenTurler": app.YUZ_UZERINDEN_TURLER, "roundMode": app.ROUND_MODE,
        "degerlendirmeTurleri": app.DEGERLENDIRME_TURLERI, "yoklamaDurumlari": app.YOKLAMA_DURUMLARI,
        "limitYuvarlama": app.LIMIT_ROUNDING, "uyariKalanBirim": app.UYARI_KALAN_BIRIM,
        "uyariKullanimOrani": app.UYARI_KULLANIM_ORANI, "renkler": app.RENKLER, "gunler": app.GUNLER,
        "ilkSaat": app.ILK_SAAT, "sonSaat": app.SON_SAAT, "bugun": "2026-11-03",
    }))`;
    return JSON.parse(execFileSync(python, ["-c", kod], { cwd: PROJE }));
}

// Sayfadaki her şeyin yerine geçen nesne: her özelliği ve her çağrısı yine kendisini döndürür.
function herSeyiKabulEden() {
    const nesne = new Proxy(function () {}, {
        get: (_, ad) => (ad === Symbol.toPrimitive ? () => "" : ad === Symbol.iterator ? [][Symbol.iterator] : nesne),
        apply: () => nesne,
        construct: () => nesne,
        set: () => true,
    });
    return nesne;
}

// static/ dosyalarını sayfadaki sırayla yükler ve fonksiyonlara erişilen ortamı döndürür.
function sayfayiYukle() {
    const sahte = herSeyiKabulEden();
    const ortam = vm.createContext({
        AYARLAR: ayarlariAl(),
        document: sahte, window: sahte, localStorage: sahte, navigator: sahte, matchMedia: sahte,
        ResizeObserver: sahte, FormData: sahte, Option: sahte, requestAnimationFrame: sahte,
        fetch: () => new Promise(() => {}),   // sunucuya istek gitmez
        setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {},
        console,
    });
    for (const dosya of ["uygulama.js", "donem.js", "yoklama.js"]) {
        vm.runInContext(fs.readFileSync(path.join(PROJE, "static", dosya), "utf8"), ortam, { filename: dosya });
    }
    // Sayfadaki "let" değişkenlerine (dersler, simulasyon, yoklamaVerisi...) ancak kod çalıştırarak erişilir.
    ortam.calistir = (kod) => vm.runInContext(kod, ortam);
    return ortam;
}

const sayfa = sayfayiYukle();

function kalem(tur, agirlik, alinan_puan = null, ekstra_puan = 0) {
    return { tur, agirlik, alinan_puan, ekstra_puan };
}

// ============================================================
// NOT HESABI
// ============================================================

test("vize/final 100 üzerinden, diğer kalemler doğrudan puan", () => {
    assert.equal(sayfa.kalemKatkisi(kalem("vize1", 40, 80)), 32);
    assert.equal(sayfa.kalemKatkisi(kalem("quiz", 10, 7)), 7);
    assert.equal(sayfa.kalemKatkisi(kalem("quiz", 10, null)), null);
    // Ağırlık sonradan girilen puanın altına indirildiyse katkı ağırlıkla sınırlanır.
    assert.equal(sayfa.kalemKatkisi(kalem("odev", 5, 8)), 5);
});

test("ders puanı 100'e kırpılmaz, ekstra puan doğrudan eklenir", () => {
    const ders = { degerlendirmeler: [
        kalem("vize1", 40, 100), kalem("final", 60, 100), kalem("proje", 5, 3, 1)] };
    const durum = sayfa.notDurumunuHesapla(ders);
    assert.equal(durum.kazanilan, 103);
    assert.equal(durum.normalToplam, 100);
    assert.equal(sayfa.harfSeviyesi(durum.kazanilan).harf, "AA");
});

test("harf seviyesi ölçeğin alt sınırlarına göre", () => {
    const harf = (puan) => sayfa.harfSeviyesi(puan).harf;
    assert.equal(harf(90), "AA");
    assert.equal(harf(89.99), "BA");
    assert.equal(harf(50), "DD");
    assert.equal(harf(49.9), "F");
    assert.equal(harf(0), "F");
});

test("hedef için finalden gereken not", () => {
    // Vize %40'tan 70 (28 puan), hedef BB (80): finalden (80 - 28) / 60 × 100 = 86.67 -> 86.7
    const ders = { hedef_not: "BB", degerlendirmeler: [kalem("vize1", 40, 70), kalem("final", 60)] };
    const mesaj = sayfa.sonucMesaji(ders, sayfa.notDurumunuHesapla(ders));
    assert.equal(mesaj.baslik, "Final'den en az 86.7 almalısın.");
});

test("hedefe ulaşıldıysa mesaj yok, ulaşılamıyorsa söylenir", () => {
    const ulasildi = { hedef_not: "CC", degerlendirmeler: [kalem("vize1", 40, 100), kalem("final", 60, 60)] };
    assert.equal(sayfa.sonucMesaji(ulasildi, sayfa.notDurumunuHesapla(ulasildi)), null);

    const imkansiz = { hedef_not: "AA", degerlendirmeler: [kalem("vize1", 50, 20), kalem("final", 50)] };
    assert.equal(sayfa.sonucMesaji(imkansiz, sayfa.notDurumunuHesapla(imkansiz)).baslik,
        "Bu hedefe ulaşmak mümkün görünmüyor.");
});

test("normal kalemler yetmiyorsa ekstra puan hesaba katılır", () => {
    // Kazanılan 40, kalan final en fazla 40 -> 80; AA (90) için ekstra 10 puan da gerekir.
    const ders = { hedef_not: "AA", degerlendirmeler: [
        kalem("vize1", 60, 66.67), kalem("final", 40), kalem("proje", 10, null, 1)] };
    const mesaj = sayfa.sonucMesaji(ders, sayfa.notDurumunuHesapla(ders));
    assert.equal(mesaj.baslik, "Ekstra olmadan bu hedefe ulaşmak mümkün görünmüyor.");
});

// ============================================================
// GPA
// ============================================================

function gpa(dersler, ayarlar) {
    sayfa.calistir(`dersler = ${JSON.stringify(dersler)}; simulasyon = {};`);
    return sayfa.gpaHesapla({ kredi_birimi: "kredi", onceki_kredi: null, onceki_gpa: null, hedef_gpa: null, ...ayarlar });
}

const yakin = (gercek, beklenen) => assert.ok(Math.abs(gercek - beklenen) < 1e-9, `${gercek} ≠ ${beklenen}`);

test("dönem GPA'sı: kredi ağırlıklı ortalama, dahil olmayan ders sayılmaz", () => {
    const sonuc = gpa([
        { id: 1, kredi: 3, hedef_not: "AA", gpaya_dahil: 1 },
        { id: 2, kredi: 2, hedef_not: "CC", gpaya_dahil: 1 },
        { id: 3, kredi: 4, hedef_not: "DD", gpaya_dahil: 0 },
    ]);
    assert.equal(sonuc.donemKredisi, 5);
    yakin(sonuc.donemGpa, (3 * 4 + 2 * 2) / 5);
    assert.equal(sonuc.yeniGpa, undefined);   // önceki kredi girilmedi
});

test("genel GPA, gereken dönem ortalaması ve en yüksek GPA", () => {
    const sonuc = gpa([{ id: 1, kredi: 10, hedef_not: "BB", gpaya_dahil: 1 }],
        { onceki_kredi: 30, onceki_gpa: 2.5, hedef_gpa: 3.0 });
    yakin(sonuc.yeniGpa, (30 * 2.5 + 10 * 3) / 40);
    yakin(sonuc.gerekenDonemGpa, (3.0 * 40 - 75) / 10);
    yakin(sonuc.enYuksekGpa, (75 + 40) / 40);
});

test("tekrar alınan dersin eski notu önceki toplamdan çıkarılır", () => {
    // Önceki: 20 kredi, GPA 2.0 (40 puan); içinde F aldığı 4 kredilik ders var. Şimdi BB hedefliyor.
    const sonuc = gpa([{ id: 1, kredi: 4, hedef_not: "BB", gpaya_dahil: 1, tekrar_eski_not: "F" }],
        { onceki_kredi: 20, onceki_gpa: 2.0 });
    assert.equal(sonuc.toplamKredi, 20);            // ders bir kez sayılır
    yakin(sonuc.yeniGpa, (40 - 0 + 4 * 3) / 20);

    const dd = gpa([{ id: 1, kredi: 4, hedef_not: "BB", gpaya_dahil: 1, tekrar_eski_not: "DD" }],
        { onceki_kredi: 20, onceki_gpa: 2.0 });
    yakin(dd.yeniGpa, (40 - 4 * 1 + 4 * 3) / 20);
});

test("ilk dönem: önceki kredi 0 ise önceki GPA gerekmez", () => {
    const sonuc = gpa([{ id: 1, kredi: 5, hedef_not: "BA", gpaya_dahil: 1 }], { onceki_kredi: 0 });
    yakin(sonuc.yeniGpa, 3.5);
});

// ============================================================
// DEVAMSIZLIK
// ============================================================

// Dönem: 2026-10-05 (Pazartesi) - 2026-10-30 (Cuma) = 4 hafta. 12 Ekim haftası pazartesi tatil.
function yoklamaKur(kayitlar, simdi = "2026-11-01T12:00") {
    sayfa.calistir(`yoklamaVerisiniAl(${JSON.stringify({
        simdi,
        donem: { baslangic: "2026-10-05", bitis: "2026-10-30" },
        ders_disi_tarihler: [{ baslangic: "2026-10-12", bitis: "2026-10-12" }],
        kayitlar,
    })})`);
}

const teori = { id: 1, gun: 0, baslangic: "09:00", bitis: "11:00", tur: "teori" };   // Pazartesi 2 saat
const online = { id: 2, gun: 2, baslangic: "13:00", bitis: "14:00", tur: "online" };  // Çarşamba 1 saat
const lab = { id: 3, gun: 3, baslangic: "15:00", bitis: "17:00", tur: "lab" };        // Perşembe 2 saat

test("ders yapılmayan günler planlanan derslerden çıkar", () => {
    yoklamaKur([]);
    assert.deepEqual([...sayfa.planlananTarihler(teori)], ["2026-10-05", "2026-10-19", "2026-10-26"]);
    assert.equal(sayfa.planlananTarihler(online).length, 4);
});

test("tek havuz: iptal toplamdan düşer, alınmadı toplamda kalır ama devamsızlık sayılmaz", () => {
    yoklamaKur([
        { oturum_id: 1, tarih: "2026-10-05", dilim: "09:00", durum: "katildi" },
        { oturum_id: 1, tarih: "2026-10-05", dilim: "10:00", durum: "katilmadi" },
        { oturum_id: 1, tarih: "2026-10-19", dilim: "09:00", durum: "iptal" },
        { oturum_id: 1, tarih: "2026-10-19", dilim: "10:00", durum: "iptal" },
        { oturum_id: 2, tarih: "2026-10-07", dilim: "13:00", durum: "alinmadi" },
    ]);
    const [havuz] = sayfa.dersYoklamasi({ devamsizlik_hakki: 30, lab_devamsizlik_hakki: null, oturumlar: [teori, online] });
    assert.equal(havuz.ad, "Toplam");
    assert.equal(havuz.toplam, 3 * 2 - 2 + 4);   // 3 pazartesi × 2 saat, 2 saat iptal; 4 online saat
    assert.equal(havuz.iptal, 2);
    assert.equal(havuz.gidilmeyen, 1);
    assert.equal(havuz.alinmadi, 1);
    assert.equal(havuz.katilimYuzdesi, 50);   // 1 / (1 + 1); alınmadı dışarıda
    assert.equal(havuz.limit, 2);             // 8 × %30 = 2.4 -> aşağı 2
    assert.equal(havuz.kalanHak, 1);
});

test("lab hakkı doluysa teori ve lab ayrı; online teori havuzunda", () => {
    yoklamaKur([]);
    const [anaHavuz, labHavuzu] = sayfa.dersYoklamasi(
        { devamsizlik_hakki: 30, lab_devamsizlik_hakki: 20, oturumlar: [teori, online, lab] });
    assert.equal(anaHavuz.ad, "Teori");
    assert.equal(anaHavuz.toplam, 3 * 2 + 4);
    assert.equal(labHavuzu.ad, "Lab");
    assert.equal(labHavuzu.toplam, 4 * 2);
    assert.equal(labHavuzu.limit, 1);   // 8 × %20 = 1.6 -> 1
});

test("limit aşılınca kırmızı, hak bitmeye yakınken sarı", () => {
    const katilmadi = (tarih, dilim) => ({ oturum_id: 1, tarih, dilim, durum: "katilmadi" });
    yoklamaKur([katilmadi("2026-10-05", "09:00"), katilmadi("2026-10-05", "10:00")]);
    const ders = { devamsizlik_hakki: 30, lab_devamsizlik_hakki: null, oturumlar: [teori] };
    assert.equal(sayfa.dersYoklamasi(ders)[0].renk, "kirmizi");   // limit 6 × %30 = 1

    yoklamaKur([]);
    assert.equal(sayfa.dersYoklamasi(ders)[0].renk, "sari");      // kalan hak 1 ≤ 2
    assert.equal(sayfa.dersYoklamasi({ ...ders, devamsizlik_hakki: null })[0].renk, null);
});
