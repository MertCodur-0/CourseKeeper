import re
import sqlite3
from datetime import date, timedelta
from pathlib import Path

from flask import Flask, jsonify, render_template, request

# Veritabanı dosyası proje klasöründe durur.
PROJE_KLASORU = Path(__file__).parent
VERITABANI_DOSYASI = PROJE_KLASORU / "derstakip.db"

# 5000 portunu Mac'te AirPlay kullandığı için 5001'i seçtik.
PORT = 5001

# Takvimdeki günler (Pazartesi başlangıçlı). Gün listesi sadece burada tanımlı.
# Veritabanında gün, bu listedeki sırasıyla tutulur (Pzt = 0, Paz = 6).
GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]

# Takvimdeki saat satırları: 09, 10, ... 20 (12 satır, son satır 21:00'de biter).
ILK_SAAT = 9
SON_SAAT = 21

# Formdaki saat listeleri: sadece tam saatler. Başlangıç 09:00-20:00, bitiş 10:00-21:00.
BASLANGIC_SAATLERI = [f"{saat:02d}:00" for saat in range(ILK_SAAT, SON_SAAT)]
BITIS_SAATLERI = [f"{saat:02d}:00" for saat in range(ILK_SAAT + 1, SON_SAAT + 1)]

# Renk paleti sadece burada tanımlı (hem ders hem sınav blokları bunu kullanır).
# Veritabanında rengin "anahtar"ı tutulur, böylece buradaki renk kodunu değiştirince
# eski dersler de yeni tonu alır. Sıra önemli: yeni derse kullanılmayan İLK renk atanır.
RENKLER = [
    {"anahtar": "kirmizi", "ad": "Kırmızı", "kod": "#E2503F"},
    {"anahtar": "mor", "ad": "Mor", "kod": "#8E2DA8"},
    {"anahtar": "limon", "ad": "Limon", "kod": "#D2DE57"},
    {"anahtar": "kahverengi", "ad": "Kahverengi", "kod": "#6D4C41"},
    {"anahtar": "civit", "ad": "Çivit", "kod": "#5E3BB0"},
    {"anahtar": "mavi", "ad": "Mavi", "kod": "#1E88E5"},
    {"anahtar": "turkuaz", "ad": "Turkuaz", "kod": "#00A98F"},
    {"anahtar": "pembe", "ad": "Pembe", "kod": "#E91E8C"},
    {"anahtar": "kehribar", "ad": "Kehribar", "kod": "#F59E0B"},
    {"anahtar": "yesil", "ad": "Yeşil", "kod": "#2E7D32"},
    {"anahtar": "camgobegi", "ad": "Camgöbeği", "kod": "#00B8D4"},
    {"anahtar": "gri", "ad": "Gri", "kod": "#546E7A"},
    {"anahtar": "bordo", "ad": "Bordo", "kod": "#B71C1C"},
    {"anahtar": "lacivert", "ad": "Lacivert", "kod": "#0D47A1"},
    {"anahtar": "turuncu", "ad": "Turuncu", "kod": "#EF6C00"},
    {"anahtar": "acik_yesil", "ad": "Açık yeşil", "kod": "#7CB342"},
]

# Blokların yazı rengi: arka plan bu eşikten parlaksa koyu, değilse beyaz yazı.
BEYAZ_YAZI = "#FFFFFF"
KOYU_YAZI = "#2B2B2B"
PARLAKLIK_ESIGI = 0.35   # 0 = siyah, 1 = beyaz


def yazi_rengi(arka_plan):
    """Arka plan renginin (ör. "#E2503F") üstünde rahat okunan yazı rengini seçer."""
    # Kırmızı, yeşil, mavi kanalları 0-1 arasına çevir.
    kanallar = [int(arka_plan[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    # Gözün algıladığı parlaklık (WCAG'in "bağıl parlaklık" formülü). Yeşil en çok, mavi en az etkiler.
    kirmizi, yesil, mavi = [
        k / 12.92 if k <= 0.04045 else ((k + 0.055) / 1.055) ** 2.4 for k in kanallar
    ]
    parlaklik = 0.2126 * kirmizi + 0.7152 * yesil + 0.0722 * mavi
    return KOYU_YAZI if parlaklik > PARLAKLIK_ESIGI else BEYAZ_YAZI


# Her rengin yazı rengi burada bir kez hesaplanır ("yazi" alanı).
for _renk in RENKLER:
    _renk["yazi"] = yazi_rengi(_renk["kod"])

# Not ölçeği: harf notu -> 4'lük katsayı. Sadece burada tanımlı.
# İleride hedef GPA ve vize/final için gereken not hesabında kullanılacak.
NOT_OLCEGI = [
    {"harf": "AA", "katsayi": 4.0},
    {"harf": "BA", "katsayi": 3.5},
    {"harf": "BB", "katsayi": 3.0},
    {"harf": "CB", "katsayi": 2.5},
    {"harf": "CC", "katsayi": 2.0},
    {"harf": "DC", "katsayi": 1.5},
    {"harf": "DD", "katsayi": 1.0},
    {"harf": "FF", "katsayi": 0.0},
]
# Hedef olarak seçilebilen notlar: FF dışındakiler.
HEDEF_NOTLARI = [satir["harf"] for satir in NOT_OLCEGI if satir["katsayi"] > 0]

OTURUM_TURLERI = [
    {"anahtar": "teori", "ad": "Teori"},
    {"anahtar": "lab", "ad": "Lab"},
]

# Değerlendirme kalemi türleri: sabit liste, sadece burada tanımlı.
# Bir derste her tür en fazla bir kez kullanılır, yani tür o kalemi tek başına tanımlar.
# "etiket": takvimdeki sınav bloğunda görünen yazı.
DEGERLENDIRME_TURLERI = [
    {"anahtar": "vize1", "ad": "Vize 1", "etiket": "VİZE 1"},
    {"anahtar": "vize2", "ad": "Vize 2", "etiket": "VİZE 2"},
    {"anahtar": "vize3", "ad": "Vize 3", "etiket": "VİZE 3"},
    {"anahtar": "final", "ad": "Final", "etiket": "FİNAL"},
    {"anahtar": "quiz", "ad": "Quiz", "etiket": "QUIZ"},
    {"anahtar": "odev", "ad": "Ödev", "etiket": "ÖDEV"},
    {"anahtar": "proje", "ad": "Proje", "etiket": "PROJE"},
    {"anahtar": "lab", "ad": "Lab", "etiket": "LAB"},
    {"anahtar": "diger1", "ad": "Diğer 1", "etiket": "DİĞER 1"},
    {"anahtar": "diger2", "ad": "Diğer 2", "etiket": "DİĞER 2"},
    {"anahtar": "diger3", "ad": "Diğer 3", "etiket": "DİĞER 3"},
]
DIGER_TURLERI = ["diger1", "diger2", "diger3"]

# Eski sürümdeki türlerin yeni karşılıkları (sadece veritabanı güncellenirken kullanılır).
# Listelenmeyen türlerin anahtarı aynı kaldı (final, quiz, odev, proje).
ESKI_TUR_KARSILIKLARI = {
    "vize": ["vize1", "vize2", "vize3"],
    "diger": [],   # doğrudan boş "Diğer" yerlerine gider
}

# "09:00" gibi tam saat biçimi (dakika hep 00).
TAM_SAAT_KALIBI = re.compile(r"^([01]\d|2[0-3]):00$")

app = Flask(__name__)


def bu_haftanin_gunleri(bugun):
    """Bugünün içinde olduğu haftanın 7 gününü (Pazartesi'den Pazar'a) döndürür."""
    # weekday(): Pazartesi 0, Pazar 6. Bu kadar gün geri gidince Pazartesi'yi buluruz.
    pazartesi = bugun - timedelta(days=bugun.weekday())
    gunler = []
    for sira, kisaltma in enumerate(GUNLER):
        tarih = pazartesi + timedelta(days=sira)
        gunler.append({
            "kisaltma": kisaltma,
            "ayin_gunu": tarih.day,
            "bugun_mu": tarih == bugun,
        })
    return gunler


# ============================================================
# VERİTABANI
# ============================================================

def veritabani_baglan():
    """SQLite veritabanına bir bağlantı açar."""
    baglanti = sqlite3.connect(VERITABANI_DOSYASI)
    # Satırlara sütun adıyla erişebilmek için (ör. satir["ad"]).
    baglanti.row_factory = sqlite3.Row
    # Ders silinince oturumları ve değerlendirme kalemleri de silinsin (ON DELETE CASCADE).
    baglanti.execute("PRAGMA foreign_keys = ON")
    return baglanti


def veritabani_hazirla():
    """Veritabanı dosyasını ve tabloları (yoksa) oluşturur, eski veritabanını günceller."""
    baglanti = veritabani_baglan()
    baglanti.executescript("""
        CREATE TABLE IF NOT EXISTS dersler (
            id                INTEGER PRIMARY KEY,
            kod               TEXT NOT NULL,      -- şube dahil, ör. "CMPE 114_01"
            ad                TEXT,
            kredi             REAL NOT NULL,
            akts              REAL,
            devamsizlik_hakki REAL,               -- yüzde, ör. 30
            renk              TEXT NOT NULL,      -- RENKLER listesindeki anahtar
            notlar            TEXT,               -- formda yok; ileride sağ panelde kullanılacak
            hedef_not         TEXT,               -- "AA", "BA" ... (eski derslerde boş olabilir)
            sinav_rengi       TEXT                -- sınav bloklarının rengi (RENKLER anahtarı)
        );

        -- Bir dersin haftalık saatleri. Bir dersin birden çok oturumu olabilir.
        CREATE TABLE IF NOT EXISTS oturumlar (
            id        INTEGER PRIMARY KEY,
            ders_id   INTEGER NOT NULL REFERENCES dersler(id) ON DELETE CASCADE,
            gun       INTEGER NOT NULL,           -- 0 = Pzt ... 6 = Paz
            baslangic TEXT NOT NULL,              -- "09:00"
            bitis     TEXT NOT NULL,              -- "11:00"
            derslik   TEXT NOT NULL,
            tur       TEXT                        -- teori / lab
        );

        -- Vize, final, ödev gibi not kalemleri. İleride not hesabı bunlardan yapılacak.
        CREATE TABLE IF NOT EXISTS degerlendirmeler (
            id         INTEGER PRIMARY KEY,
            ders_id    INTEGER NOT NULL REFERENCES dersler(id) ON DELETE CASCADE,
            ad         TEXT NOT NULL,             -- eski sürümden kalan ad; formda yok, yeni kalemde boş
            tur        TEXT NOT NULL,             -- DEGERLENDIRME_TURLERI listesindeki anahtar
            agirlik    REAL NOT NULL,             -- yüzde, ör. 40
            tarih      TEXT,                      -- "2026-11-15"
            saat       TEXT,                      -- başlangıç saati, "13:00"
            bitis_saat TEXT                       -- boşsa süre 1 saat kabul edilir
        );
    """)
    silinenler = veritabani_guncelle(baglanti)
    baglanti.close()
    for silinen in silinenler:
        print("UYARI: yer kalmadığı için silinen değerlendirme kalemi ->", silinen)


def sutun_yoksa_ekle(baglanti, tablo, sutun):
    """Eski veritabanında olmayan bir sütunu ekler. Mevcut satırlarda bu sütun boş kalır."""
    mevcut_sutunlar = [satir["name"] for satir in baglanti.execute(f"PRAGMA table_info({tablo})")]
    if sutun not in mevcut_sutunlar:
        baglanti.execute(f"ALTER TABLE {tablo} ADD COLUMN {sutun} TEXT")


def veritabani_guncelle(baglanti):
    """Eski sürümle oluşturulmuş veritabanını, veri silmeden yeni düzene getirir.

    Her açılışta çalışır; zaten güncel olan veritabanında hiçbir şey değiştirmez.
    Yer kalmadığı için silinmek zorunda kalan kalemlerin listesini döndürür.
    """
    sutun_yoksa_ekle(baglanti, "dersler", "hedef_not")
    sutun_yoksa_ekle(baglanti, "dersler", "sinav_rengi")
    sutun_yoksa_ekle(baglanti, "degerlendirmeler", "bitis_saat")

    silinenler = []
    # "with baglanti": içindeki işlemler tek seferde kaydedilir, hata olursa hiçbiri kaydedilmez.
    with baglanti:
        # "Alıştırma" oturum türü kalktı.
        baglanti.execute("UPDATE oturumlar SET tur = 'teori' WHERE tur = 'alistirma'")

        gecerli_turler = [tur["anahtar"] for tur in DEGERLENDIRME_TURLERI]
        for ders in baglanti.execute("SELECT id, kod, renk, sinav_rengi FROM dersler").fetchall():
            # Eski türleri yeni listeye taşı ve her türün derste bir kez geçmesini sağla.
            # Kalemin önce kendi türü denenir, doluysa boş "Diğer" yerleri.
            dolu_turler = set()
            kalemler = baglanti.execute(
                "SELECT id, ad, tur, tarih FROM degerlendirmeler WHERE ders_id = ? ORDER BY id",
                (ders["id"],),
            ).fetchall()
            for kalem in kalemler:
                adaylar = ESKI_TUR_KARSILIKLARI.get(kalem["tur"], [kalem["tur"]]) + DIGER_TURLERI
                yeni_tur = next(
                    (aday for aday in adaylar if aday in gecerli_turler and aday not in dolu_turler),
                    None,
                )
                if yeni_tur is None:
                    baglanti.execute("DELETE FROM degerlendirmeler WHERE id = ?", (kalem["id"],))
                    silinenler.append(f'{ders["kod"]}: "{kalem["ad"]}" (tür: {kalem["tur"]})')
                    continue
                dolu_turler.add(yeni_tur)
                if yeni_tur != kalem["tur"]:
                    baglanti.execute(
                        "UPDATE degerlendirmeler SET tur = ? WHERE id = ?", (yeni_tur, kalem["id"])
                    )

            # Tarihli kalemi olup sınav rengi olmayan eski derse sınav rengi ata.
            tarihli_var = any(kalem["tarih"] for kalem in kalemler)
            if tarihli_var and ders["sinav_rengi"] is None:
                baglanti.execute(
                    "UPDATE dersler SET sinav_rengi = ? WHERE id = ?",
                    (siradaki_renk(baglanti, haric=ders["renk"]), ders["id"]),
                )
    return silinenler


def dersleri_getir(baglanti):
    """Bütün dersleri, oturumları ve değerlendirme kalemleriyle birlikte döndürür."""
    dersler = [dict(satir) for satir in baglanti.execute("SELECT * FROM dersler ORDER BY id")]
    for ders in dersler:
        ders["oturumlar"] = [dict(satir) for satir in baglanti.execute(
            "SELECT id, gun, baslangic, bitis, derslik, tur FROM oturumlar"
            " WHERE ders_id = ? ORDER BY gun, baslangic",
            (ders["id"],),
        )]
        ders["degerlendirmeler"] = [dict(satir) for satir in baglanti.execute(
            "SELECT id, tur, agirlik, tarih, saat, bitis_saat FROM degerlendirmeler"
            " WHERE ders_id = ? ORDER BY id",
            (ders["id"],),
        )]
    return dersler


def siradaki_renk(baglanti, haric=None):
    """Hiçbir dersin ders rengi veya sınav rengi olarak kullanmadığı ilk palet rengini döndürür.

    Bütün renkler kullanılmışsa en az kullanılanı seçer.
    haric: seçilmemesi gereken renk (sınav rengi, dersin kendi renginden farklı olsun diye).
    """
    kullanim = {renk["anahtar"]: 0 for renk in RENKLER}
    for satir in baglanti.execute("SELECT renk, sinav_rengi FROM dersler"):
        for anahtar in (satir["renk"], satir["sinav_rengi"]):
            if anahtar in kullanim:
                kullanim[anahtar] += 1
    adaylar = [renk["anahtar"] for renk in RENKLER if renk["anahtar"] != haric]
    # min(): eşitlikte listedeki ilk rengi verir; hiç kullanılmamış (0) renk varsa o seçilir.
    return min(adaylar, key=lambda anahtar: kullanim[anahtar])


def alt_satirlari_esitle(baglanti, tablo, sutunlar, ders_id, satirlar, yeni_satir_ekleri=None):
    """Bir dersin oturumlarını (veya değerlendirme kalemlerini) formdaki haline getirir.

    Var olan satır güncellenir (kimliği değişmez), yeni satır eklenir,
    formdan çıkarılmış satır silinir.
    yeni_satir_ekleri: sadece yeni satır eklenirken yazılan sabit değerler ({sütun: değer}).
    """
    ekler = yeni_satir_ekleri or {}
    mevcut = {satir["id"] for satir in baglanti.execute(
        f"SELECT id FROM {tablo} WHERE ders_id = ?", (ders_id,)
    )}
    kalanlar = set()
    for satir in satirlar:
        degerler = [satir[sutun] for sutun in sutunlar]
        if satir["id"] in mevcut:
            atamalar = ", ".join(f"{sutun} = ?" for sutun in sutunlar)
            baglanti.execute(f"UPDATE {tablo} SET {atamalar} WHERE id = ?", degerler + [satir["id"]])
            kalanlar.add(satir["id"])
        else:
            eklenen_sutunlar = ["ders_id"] + sutunlar + list(ekler)
            soru_isaretleri = ", ".join("?" for _ in eklenen_sutunlar)
            baglanti.execute(
                f"INSERT INTO {tablo} ({', '.join(eklenen_sutunlar)}) VALUES ({soru_isaretleri})",
                [ders_id] + degerler + list(ekler.values()),
            )
    for silinecek in mevcut - kalanlar:
        baglanti.execute(f"DELETE FROM {tablo} WHERE id = ?", (silinecek,))


def dersi_kaydet(baglanti, ders, ders_id=None):
    """Dersi ekler (ders_id yoksa) veya günceller. Dersin kimliğini döndürür.

    "notlar" sütununa dokunulmaz (formda yok, mevcut değer aynen kalır).
    """
    degerler = [ders["kod"], ders["ad"], ders["kredi"], ders["akts"],
                ders["devamsizlik_hakki"], ders["renk"], ders["hedef_not"]]
    if ders_id is None:
        imlec = baglanti.execute(
            "INSERT INTO dersler (kod, ad, kredi, akts, devamsizlik_hakki, renk, hedef_not)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            degerler,
        )
        ders_id = imlec.lastrowid
    else:
        baglanti.execute(
            "UPDATE dersler SET kod = ?, ad = ?, kredi = ?, akts = ?,"
            " devamsizlik_hakki = ?, renk = ?, hedef_not = ? WHERE id = ?",
            degerler + [ders_id],
        )
    alt_satirlari_esitle(baglanti, "oturumlar",
                         ["gun", "baslangic", "bitis", "derslik", "tur"],
                         ders_id, ders["oturumlar"])
    alt_satirlari_esitle(baglanti, "degerlendirmeler",
                         ["tur", "agirlik", "tarih", "saat", "bitis_saat"],
                         ders_id, ders["degerlendirmeler"],
                         yeni_satir_ekleri={"ad": ""})

    # Sınav rengi: dersin ilk tarihli kalemi eklenince otomatik atanır ve dersle saklanır.
    # (Ders rengi sonradan sınav rengiyle aynı yapıldıysa sınav rengi yenilenir.)
    sinav_rengi = baglanti.execute(
        "SELECT sinav_rengi FROM dersler WHERE id = ?", (ders_id,)
    ).fetchone()["sinav_rengi"]
    tarihli_var = any(kalem["tarih"] for kalem in ders["degerlendirmeler"])
    if tarihli_var and (sinav_rengi is None or sinav_rengi == ders["renk"]):
        baglanti.execute(
            "UPDATE dersler SET sinav_rengi = ? WHERE id = ?",
            (siradaki_renk(baglanti, haric=ders["renk"]), ders_id),
        )
    return ders_id


# ============================================================
# FORMDAN GELEN VERİNİN KONTROLÜ
# ============================================================

def metin(deger):
    """Değeri baştaki/sondaki boşlukları atılmış metne çevirir. Boşsa "" döner."""
    return "" if deger is None else str(deger).strip()


def sayiya_cevir(deger):
    """Boş değeri None, sayıyı float yapar. Sayı değilse ValueError verir."""
    if metin(deger) == "":
        return None
    return float(metin(deger).replace(",", "."))


def satir_kimligi(satir):
    """Satırın veritabanı kimliği (yeni satırda None)."""
    return satir.get("id") if isinstance(satir.get("id"), int) else None


def tarih_gecerli_mi(yazi):
    """ "2026-11-15" biçiminde gerçek bir tarih mi?"""
    try:
        date.fromisoformat(yazi)
        return True
    except ValueError:
        return False


def dersi_dogrula(veri):
    """Formdan gelen dersi kontrol eder. (temiz_ders, hata_mesaji) döndürür.

    Her şey yolundaysa hata_mesaji None olur.
    Zorunlu alanlar: ders kodu, kredi, hedef harf notu, en az bir oturum.
    """
    try:
        kredi = sayiya_cevir(veri.get("kredi"))
        akts = sayiya_cevir(veri.get("akts"))
        devamsizlik_hakki = sayiya_cevir(veri.get("devamsizlik_hakki"))
    except ValueError:
        return None, "Kredi, AKTS ve devamsızlık hakkı sayı olmalı."

    kod = metin(veri.get("kod"))
    if not kod:
        return None, "Ders kodu zorunlu."
    if kredi is None or kredi < 0:
        return None, "Kredi zorunlu ve 0 veya daha büyük olmalı."
    hedef_not = metin(veri.get("hedef_not"))
    if hedef_not not in HEDEF_NOTLARI:
        return None, "Hedef harf notu zorunlu."

    oturum_turleri = [tur["anahtar"] for tur in OTURUM_TURLERI]
    oturumlar = []
    for oturum in veri.get("oturumlar") or []:
        gun = oturum.get("gun")
        baslangic = metin(oturum.get("baslangic"))
        bitis = metin(oturum.get("bitis"))
        derslik = metin(oturum.get("derslik"))
        tur = metin(oturum.get("tur")) or None
        if not isinstance(gun, int) or not 0 <= gun < len(GUNLER):
            return None, "Her oturum için gün seçilmeli."
        if not TAM_SAAT_KALIBI.match(baslangic) or not TAM_SAAT_KALIBI.match(bitis):
            return None, "Oturum saatleri tam saat olmalı (ör. 09:00)."
        # "09:00" < "11:00" karşılaştırması metin olarak da doğru çalışır.
        if bitis <= baslangic:
            return None, "Bitiş saati başlangıçtan sonra olmalı."
        if not derslik:
            return None, "Her oturum için derslik zorunlu."
        if tur is not None and tur not in oturum_turleri:
            return None, "Geçersiz oturum türü."
        oturumlar.append({"id": satir_kimligi(oturum), "gun": gun, "baslangic": baslangic,
                          "bitis": bitis, "derslik": derslik, "tur": tur})
    if not oturumlar:
        return None, "En az 1 oturum gerekli."

    degerlendirme_turleri = [tur["anahtar"] for tur in DEGERLENDIRME_TURLERI]
    kullanilan_turler = set()
    degerlendirmeler = []
    for kalem in veri.get("degerlendirmeler") or []:
        tur = metin(kalem.get("tur"))
        tarih = metin(kalem.get("tarih")) or None
        saat = metin(kalem.get("saat")) or None
        bitis_saat = metin(kalem.get("bitis_saat")) or None
        try:
            agirlik = sayiya_cevir(kalem.get("agirlik"))
        except ValueError:
            agirlik = None
        if tur not in degerlendirme_turleri or agirlik is None or agirlik < 0:
            return None, "Değerlendirme kalemlerinde tür ve ağırlık zorunlu."
        if tur in kullanilan_turler:
            return None, "Aynı değerlendirme türü bir derste en fazla bir kez kullanılabilir."
        kullanilan_turler.add(tur)
        if tarih is not None and not tarih_gecerli_mi(tarih):
            return None, "Değerlendirme tarihi geçersiz."
        if saat is not None and not TAM_SAAT_KALIBI.match(saat):
            return None, "Değerlendirme saati tam saat olmalı (ör. 13:00)."
        if bitis_saat is not None:
            if saat is None or not TAM_SAAT_KALIBI.match(bitis_saat) or bitis_saat <= saat:
                return None, "Değerlendirme bitiş saati başlangıçtan sonra olmalı."
        degerlendirmeler.append({"id": satir_kimligi(kalem), "tur": tur, "agirlik": agirlik,
                                 "tarih": tarih, "saat": saat, "bitis_saat": bitis_saat})

    renk = metin(veri.get("renk"))
    if renk not in [r["anahtar"] for r in RENKLER]:
        renk = None  # kaydederken kullanılmayan ilk renk atanır

    ders = {
        "kod": kod,
        "ad": metin(veri.get("ad")) or None,
        "kredi": kredi,
        "akts": akts,
        "devamsizlik_hakki": devamsizlik_hakki,
        "renk": renk,
        "hedef_not": hedef_not,
        "oturumlar": oturumlar,
        "degerlendirmeler": degerlendirmeler,
    }
    return ders, None


# ============================================================
# SAYFALAR
# ============================================================

@app.route("/")
def ana_sayfa():
    bugun = date.today()
    return render_template(
        "index.html",
        bugun_yazisi=bugun.strftime("%d/%m"),
        gunler=bu_haftanin_gunleri(bugun),
        saatler=range(ILK_SAAT, SON_SAAT),
        ilk_saat=ILK_SAAT,
        renkler=RENKLER,
        hedef_notlari=HEDEF_NOTLARI,
        baslangic_saatleri=BASLANGIC_SAATLERI,
        bitis_saatleri=BITIS_SAATLERI,
        oturum_turleri=OTURUM_TURLERI,
        degerlendirme_turleri=DEGERLENDIRME_TURLERI,
        # JavaScript'in ihtiyaç duyduğu ayarlar (sayfaya JSON olarak yazılır).
        ayarlar={
            "renkler": RENKLER,
            "ilkSaat": ILK_SAAT,
            "sonSaat": SON_SAAT,
            "gunler": GUNLER,
            "bugun": bugun.isoformat(),
            "degerlendirmeTurleri": DEGERLENDIRME_TURLERI,
        },
    )


# ============================================================
# DERS API'si (sayfadaki JavaScript bunları çağırır)
# ============================================================

@app.route("/api/dersler", methods=["GET"])
def api_dersleri_listele():
    baglanti = veritabani_baglan()
    sonuc = {"dersler": dersleri_getir(baglanti), "siradaki_renk": siradaki_renk(baglanti)}
    baglanti.close()
    return jsonify(sonuc)


@app.route("/api/dersler", methods=["POST"])
def api_ders_ekle():
    ders, hata = dersi_dogrula(request.get_json(silent=True) or {})
    if hata:
        return jsonify({"hata": hata}), 400
    baglanti = veritabani_baglan()
    if ders["renk"] is None:
        ders["renk"] = siradaki_renk(baglanti)
    # "with baglanti": içindeki işlemler tek seferde kaydedilir, hata olursa hiçbiri kaydedilmez.
    with baglanti:
        ders_id = dersi_kaydet(baglanti, ders)
    baglanti.close()
    return jsonify({"id": ders_id}), 201


@app.route("/api/dersler/<int:ders_id>", methods=["PUT"])
def api_ders_guncelle(ders_id):
    ders, hata = dersi_dogrula(request.get_json(silent=True) or {})
    if hata:
        return jsonify({"hata": hata}), 400
    baglanti = veritabani_baglan()
    eski = baglanti.execute("SELECT renk FROM dersler WHERE id = ?", (ders_id,)).fetchone()
    if eski is None:
        baglanti.close()
        return jsonify({"hata": "Ders bulunamadı."}), 404
    if ders["renk"] is None:
        ders["renk"] = eski["renk"]
    with baglanti:
        dersi_kaydet(baglanti, ders, ders_id)
    baglanti.close()
    return jsonify({"id": ders_id})


@app.route("/api/dersler/<int:ders_id>", methods=["DELETE"])
def api_ders_sil(ders_id):
    baglanti = veritabani_baglan()
    with baglanti:
        # Oturumlar ve değerlendirme kalemleri de birlikte silinir (ON DELETE CASCADE).
        baglanti.execute("DELETE FROM dersler WHERE id = ?", (ders_id,))
    baglanti.close()
    return jsonify({"silindi": True})


if __name__ == "__main__":
    veritabani_hazirla()
    # 127.0.0.1: uygulamaya sadece bu Mac'ten erişilebilir.
    app.run(host="127.0.0.1", port=PORT, debug=True)
