import re
import shutil
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import RequestEntityTooLarge

import syllabus
from syllabus import SyllabusHatasi

# Veritabanı dosyası proje klasöründe durur.
PROJE_KLASORU = Path(__file__).parent
VERITABANI_DOSYASI = PROJE_KLASORU / "derstakip.db"

# Gizli ayarlar (GEMINI_API_KEY, GEMINI_MODEL) bu dosyadan okunur. Anahtar koda yazılmaz.
ENV_DOSYASI = PROJE_KLASORU / ".env"

# Syllabus olarak kabul edilen en büyük dosya.
SYLLABUS_EN_FAZLA_MB = 20

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

# Harf notu ölçeği: sadece burada tanımlı. Bütün dersler MUTLAK notlandırma ile hesaplanır.
#   katsayi   : 4'lük sistemdeki puan
#   alt_sinir : o harfi almak için gereken en düşük ders puanı (AA: 90-100, BA: 85-89, ...)
# Liste yüksekten düşüğe sıralıdır. F sadece "şu anki seviye"yi göstermek içindir.
NOT_OLCEGI = [
    {"harf": "AA", "katsayi": 4.0, "alt_sinir": 90},
    {"harf": "BA", "katsayi": 3.5, "alt_sinir": 85},
    {"harf": "BB", "katsayi": 3.0, "alt_sinir": 80},
    {"harf": "CB", "katsayi": 2.5, "alt_sinir": 75},
    {"harf": "CC", "katsayi": 2.0, "alt_sinir": 70},
    {"harf": "DC", "katsayi": 1.5, "alt_sinir": 60},
    {"harf": "DD", "katsayi": 1.0, "alt_sinir": 50},
    {"harf": "F", "katsayi": 0.0, "alt_sinir": 0},
]
# Hedef olarak seçilebilen notlar: F dışındakiler (AA ... DD).
HEDEF_NOTLARI = [satir["harf"] for satir in NOT_OLCEGI if satir["katsayi"] > 0]

# Puan bir harfin alt sınırıyla karşılaştırılmadan önce nasıl yuvarlanır?
#   "none"    : yuvarlama yok (89.99, 90 sayılmaz)
#   "nearest" : en yakın tam sayıya yuvarlanır (89.5 ve üstü 90 sayılır)
# Karşılaştırma tarayıcıda yapılır (uygulama.js: etkinEsik).
ROUND_MODE = "none"

OTURUM_TURLERI = [
    {"anahtar": "teori", "ad": "Teori"},
    {"anahtar": "lab", "ad": "Lab"},
]

# Değerlendirme kalemi türleri: sabit liste, sadece burada tanımlı.
# Bir derste her tür en fazla bir kez kullanılır, yani tür o kalemi tek başına tanımlar.
# "etiket": takvimdeki sınav bloğunda görünen yazı.
# "den_hali": sağ paneldeki "Final'den en az 85 almalısın" cümlesi için (vize ve finalde kullanılır).
DEGERLENDIRME_TURLERI = [
    {"anahtar": "vize1", "ad": "Vize 1", "etiket": "VİZE 1", "den_hali": "Vize 1'den"},
    {"anahtar": "vize2", "ad": "Vize 2", "etiket": "VİZE 2", "den_hali": "Vize 2'den"},
    {"anahtar": "vize3", "ad": "Vize 3", "etiket": "VİZE 3", "den_hali": "Vize 3'ten"},
    {"anahtar": "final", "ad": "Final", "etiket": "FİNAL", "den_hali": "Final'den"},
    {"anahtar": "quiz", "ad": "Quiz", "etiket": "QUIZ", "den_hali": "Quiz'den"},
    {"anahtar": "odev", "ad": "Ödev", "etiket": "ÖDEV", "den_hali": "Ödev'den"},
    {"anahtar": "proje", "ad": "Proje", "etiket": "PROJE", "den_hali": "Proje'den"},
    {"anahtar": "lab", "ad": "Lab", "etiket": "LAB", "den_hali": "Lab'dan"},
    {"anahtar": "diger1", "ad": "Diğer 1", "etiket": "DİĞER 1", "den_hali": "Diğer 1'den"},
    {"anahtar": "diger2", "ad": "Diğer 2", "etiket": "DİĞER 2", "den_hali": "Diğer 2'den"},
    {"anahtar": "diger3", "ad": "Diğer 3", "etiket": "DİĞER 3", "den_hali": "Diğer 3'ten"},
]
DIGER_TURLERI = ["diger1", "diger2", "diger3"]

# Alınan puanı 100 üzerinden girilen türler: katkı = ağırlık × girilen / 100.
# Diğer bütün türlerde (quiz, ödev, proje, lab, diğer; ekstra olanlar dahil) girilen değer
# 0 ile kalemin ağırlığı arasında doğrudan PUAN'dır: katkı = girilen değer.
YUZ_UZERINDEN_TURLER = ["vize1", "vize2", "vize3", "final"]

# Numarasız genel türlerin (eski sürümden ya da syllabus'tan gelen) listedeki karşılıkları.
# Burada olmayan türlerin anahtarı aynıdır (final, quiz, odev, proje, lab).
TUR_ADAYLARI = {
    "vize": ["vize1", "vize2", "vize3"],
    "diger": [],   # doğrudan boş "Diğer" yerlerine gider
}


def bos_tur_bul(tur, dolu_turler):
    """Kalem için derste henüz kullanılmamış uygun türü bulur.

    Önce kalemin kendi türü denenir (vize için Vize 1, 2, 3), doluysa boş "Diğer" yerleri.
    Hiç yer kalmadıysa None döner.
    """
    gecerli_turler = [satir["anahtar"] for satir in DEGERLENDIRME_TURLERI]
    adaylar = TUR_ADAYLARI.get(tur, [tur]) + DIGER_TURLERI
    return next(
        (aday for aday in adaylar if aday in gecerli_turler and aday not in dolu_turler), None
    )


# Tek bir değerlendirme kaleminin ağırlığı en fazla bu kadar olabilir (yanlış yazımlara karşı).
# Kalemlerin TOPLAMI %100'ü aşabilir (ekstra puan), toplam için sınır yoktur.
EN_FAZLA_AGIRLIK = 200

# "09:00" gibi tam saat biçimi (dakika hep 00).
TAM_SAAT_KALIBI = re.compile(r"^([01]\d|2[0-3]):00$")

app = Flask(__name__)
# Bundan büyük istekler baştan reddedilir (dosya + küçük bir pay).
app.config["MAX_CONTENT_LENGTH"] = (SYLLABUS_EN_FAZLA_MB + 1) * 1024 * 1024


def bu_haftanin_gunleri(bugun):
    """Bugünün içinde olduğu haftanın 7 gününü (Pazartesi'den Pazar'a) döndürür."""
    # weekday(): Pazartesi 0, Pazar 6. Bu kadar gün geri gidince Pazartesi'yi buluruz.
    pazartesi = bugun - timedelta(days=bugun.weekday())
    gunler = []
    for sira, kisaltma in enumerate(GUNLER):
        tarih = pazartesi + timedelta(days=sira)
        gunler.append({
            "kisaltma": kisaltma,
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
            notlar            TEXT,               -- formda yok; sağ paneldeki "Notlar" sekmesinden yazılır
            hedef_not         TEXT,               -- "AA", "BA" ... (eski derslerde boş olabilir)
            devamsizlik_metni TEXT,               -- formda yok: syllabus'ta yüzde olarak yazmayan devamsızlık kuralı
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
            ad         TEXT NOT NULL,             -- formda yok: kalemin eski sürümdeki ya da syllabus'taki adı
            tur        TEXT NOT NULL,             -- DEGERLENDIRME_TURLERI listesindeki anahtar
            agirlik    REAL NOT NULL,             -- yüzde, ör. 40
            ekstra_puan INTEGER NOT NULL DEFAULT 0, -- 1: ekstra (bonus) puan, normal toplama sayılmaz
            alinan_puan REAL,                     -- vize/final: 0-100; diğerleri: 0-ağırlık; boş: açıklanmadı
            tarih      TEXT,                      -- "2026-11-15"
            saat       TEXT,                      -- başlangıç saati, "13:00"
            bitis_saat TEXT                       -- boşsa süre 1 saat kabul edilir
        );
    """)
    silinenler = veritabani_guncelle(baglanti)
    veri_surumunu_yukselt(baglanti)
    baglanti.close()
    for silinen in silinenler:
        print("UYARI: yer kalmadığı için silinen değerlendirme kalemi ->", silinen)


def sutun_yoksa_ekle(baglanti, tablo, sutun, tanim="TEXT"):
    """Eski veritabanında olmayan bir sütunu ekler.

    Mevcut satırlarda bu sütun boş kalır (tanımda DEFAULT varsa o değeri alır).
    """
    mevcut_sutunlar = [satir["name"] for satir in baglanti.execute(f"PRAGMA table_info({tablo})")]
    if sutun not in mevcut_sutunlar:
        baglanti.execute(f"ALTER TABLE {tablo} ADD COLUMN {sutun} {tanim}")


def veritabani_guncelle(baglanti):
    """Eski sürümle oluşturulmuş veritabanını, veri silmeden yeni düzene getirir.

    Her açılışta çalışır; zaten güncel olan veritabanında hiçbir şey değiştirmez.
    Yer kalmadığı için silinmek zorunda kalan kalemlerin listesini döndürür.
    """
    sutun_yoksa_ekle(baglanti, "dersler", "hedef_not")
    sutun_yoksa_ekle(baglanti, "dersler", "sinav_rengi")
    sutun_yoksa_ekle(baglanti, "dersler", "devamsizlik_metni")
    sutun_yoksa_ekle(baglanti, "degerlendirmeler", "bitis_saat")
    # Mevcut bütün kalemler "ekstra değil" (0) olarak kalır.
    sutun_yoksa_ekle(baglanti, "degerlendirmeler", "ekstra_puan", "INTEGER NOT NULL DEFAULT 0")
    # Mevcut kalemlerde alınan puan boş kalır.
    sutun_yoksa_ekle(baglanti, "degerlendirmeler", "alinan_puan", "REAL")

    silinenler = []
    # "with baglanti": içindeki işlemler tek seferde kaydedilir, hata olursa hiçbiri kaydedilmez.
    with baglanti:
        # "Alıştırma" oturum türü kalktı.
        baglanti.execute("UPDATE oturumlar SET tur = 'teori' WHERE tur = 'alistirma'")

        for ders in baglanti.execute("SELECT id, kod, renk, sinav_rengi FROM dersler").fetchall():
            # Eski türleri yeni listeye taşı ve her türün derste bir kez geçmesini sağla.
            # Kalemin önce kendi türü denenir, doluysa boş "Diğer" yerleri.
            dolu_turler = set()
            kalemler = baglanti.execute(
                "SELECT id, ad, tur, tarih FROM degerlendirmeler WHERE ders_id = ? ORDER BY id",
                (ders["id"],),
            ).fetchall()
            for kalem in kalemler:
                yeni_tur = bos_tur_bul(kalem["tur"], dolu_turler)
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


def veri_surumunu_yukselt(baglanti):
    """Bir kez yapılması gereken veri dönüşümlerini uygular.

    Hangi dönüşümlerin yapıldığı veritabanının içindeki sürüm numarasından (PRAGMA user_version)
    anlaşılır; sunucu yeniden başlayınca aynı dönüşüm tekrar uygulanmaz.

    Sürüm 1: Eskiden bütün kalemlerin alınan puanı 100 üzerinden saklanıyordu. Vize ve final
    dışındaki kalemlerde değer artık doğrudan puandır: yeni = eski × ağırlık / 100.
    Dönüşümden önce veritabanının yedeği alınır; her dersin toplam puanı aynı kalmalıdır.
    """
    # Başka bir işlem aynı anda dönüştürmesin diye önce yazma kilidi alınır.
    baglanti.execute("BEGIN IMMEDIATE")
    try:
        surum = baglanti.execute("PRAGMA user_version").fetchone()[0]
        if surum < 1:
            puanli_kalemler = baglanti.execute(
                "SELECT id, ders_id, tur, agirlik, alinan_puan FROM degerlendirmeler"
                " WHERE alinan_puan IS NOT NULL"
            ).fetchall()
            donusecekler = [k for k in puanli_kalemler if k["tur"] not in YUZ_UZERINDEN_TURLER]
            if donusecekler:
                yedek = PROJE_KLASORU / f"derstakip.backup-{datetime.now():%Y-%m-%d-%H%M%S}-donusum-oncesi.db"
                shutil.copy2(VERITABANI_DOSYASI, yedek)
                print(f"Veri dönüşümü (sürüm 1): {len(donusecekler)} kalem dönüştürülüyor. Yedek: {yedek.name}")

            # Dönüşümden önce her dersin kazanılan puanı (eski kural: hepsi 100 üzerinden).
            onceki = {}
            for kalem in puanli_kalemler:
                katki = kalem["agirlik"] * kalem["alinan_puan"] / 100
                onceki[kalem["ders_id"]] = onceki.get(kalem["ders_id"], 0) + katki

            sonraki = {}
            for kalem in puanli_kalemler:
                if kalem["tur"] in YUZ_UZERINDEN_TURLER:
                    katki = kalem["agirlik"] * kalem["alinan_puan"] / 100
                else:
                    katki = round(kalem["alinan_puan"] * kalem["agirlik"] / 100, 2)
                    baglanti.execute(
                        "UPDATE degerlendirmeler SET alinan_puan = ? WHERE id = ?", (katki, kalem["id"])
                    )
                sonraki[kalem["ders_id"]] = sonraki.get(kalem["ders_id"], 0) + katki

            # Kontrol: toplamlar aynı kalmalı (fark sadece 2 basamağa yuvarlamadan gelebilir).
            for ders_id, eski_toplam in onceki.items():
                if abs(sonraki[ders_id] - eski_toplam) > 0.005 * len(donusecekler) + 1e-9:
                    raise RuntimeError(
                        f"Veri dönüşümü durduruldu: {ders_id} numaralı dersin toplam puanı değişiyor "
                        f"({eski_toplam} -> {sonraki[ders_id]}). Hiçbir değişiklik kaydedilmedi."
                    )
            baglanti.execute("PRAGMA user_version = 1")
        baglanti.commit()
    except Exception:
        baglanti.rollback()
        raise


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
            "SELECT id, ad, tur, agirlik, ekstra_puan, alinan_puan, tarih, saat, bitis_saat"
            " FROM degerlendirmeler"
            " WHERE ders_id = ? ORDER BY id",
            (ders["id"],),
        )]
        for kalem in ders["degerlendirmeler"]:
            # Veritabanında 0/1 tutulur; dışarıya evet/hayır (true/false) olarak verilir.
            kalem["ekstra_puan"] = bool(kalem["ekstra_puan"])
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


def alt_satirlari_esitle(baglanti, tablo, sutunlar, ders_id, satirlar):
    """Bir dersin oturumlarını (veya değerlendirme kalemlerini) formdaki haline getirir.

    Var olan satır güncellenir (kimliği değişmez), yeni satır eklenir,
    formdan çıkarılmış satır silinir.
    """
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
            soru_isaretleri = ", ".join("?" for _ in sutunlar)
            baglanti.execute(
                f"INSERT INTO {tablo} (ders_id, {', '.join(sutunlar)}) VALUES (?, {soru_isaretleri})",
                [ders_id] + degerler,
            )
    for silinecek in mevcut - kalanlar:
        baglanti.execute(f"DELETE FROM {tablo} WHERE id = ?", (silinecek,))


def dersi_kaydet(baglanti, ders, ders_id=None):
    """Dersi ekler (ders_id yoksa) veya günceller. Dersin kimliğini döndürür.

    "notlar" sütununa ve kalemlerin "alinan_puan" değerine dokunulmaz (formda yoklar, sağ panelden
    yazılırlar; mevcut değerler aynen kalır).
    "devamsizlik_metni" sadece ders eklenirken yazılır (syllabus'tan gelir), güncellemede aynen kalır.
    """
    degerler = [ders["kod"], ders["ad"], ders["kredi"], ders["akts"],
                ders["devamsizlik_hakki"], ders["renk"], ders["hedef_not"]]
    if ders_id is None:
        imlec = baglanti.execute(
            "INSERT INTO dersler (kod, ad, kredi, akts, devamsizlik_hakki, renk, hedef_not,"
            " devamsizlik_metni) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            degerler + [ders["devamsizlik_metni"]],
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
                         ["ad", "tur", "agirlik", "ekstra_puan", "tarih", "saat", "bitis_saat"],
                         ders_id, ders["degerlendirmeler"])

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
        if tur not in degerlendirme_turleri or agirlik is None:
            return None, "Değerlendirme kalemlerinde tür ve ağırlık zorunlu."
        if not 0 <= agirlik <= EN_FAZLA_AGIRLIK:
            return None, f"Bir kalemin ağırlığı %0 ile %{EN_FAZLA_AGIRLIK} arasında olmalı."
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
        # "ad" formda görünmez; satırla birlikte taşınır (eski sürümdeki ya da syllabus'taki ad).
        degerlendirmeler.append({"id": satir_kimligi(kalem), "ad": metin(kalem.get("ad")),
                                 "tur": tur, "agirlik": agirlik,
                                 # Sadece açıkça işaretlenmişse ekstra; aksi halde normal kalem.
                                 "ekstra_puan": 1 if kalem.get("ekstra_puan") is True else 0,
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
        "devamsizlik_metni": metin(veri.get("devamsizlik_metni")) or None,
        "oturumlar": oturumlar,
        "degerlendirmeler": degerlendirmeler,
    }
    return ders, None


# ============================================================
# SYLLABUS: okunan veriyi ders formuna çevirme
# ============================================================

def dosya_turunu_bul(icerik):
    """Dosyanın türünü ilk baytlarından anlar (uzantıya güvenmez). Desteklenmiyorsa None."""
    if icerik.startswith(b"%PDF"):
        return "application/pdf"
    if icerik.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if icerik.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def isaret_ekle(isaretler, alan, aciklama):
    """Formda sarı gösterilecek alanı ve nedenini kaydeder (bir alanın birden çok nedeni olabilir)."""
    isaretler[alan] = f"{isaretler[alan]}; {aciklama}" if alan in isaretler else aciklama


def syllabus_sayisi(deger, en_fazla=None):
    """Syllabus'tan gelen sayıyı kontrol eder; sayı değilse, negatifse ya da sınırı aşıyorsa None."""
    if isinstance(deger, bool) or not isinstance(deger, (int, float)):
        return None
    if deger < 0 or (en_fazla is not None and deger > en_fazla):
        return None
    return deger


def syllabus_saati(deger, yon):
    """Syllabus'tan gelen saati formdaki tam saat listesine uydurur. (saat, açıklama) döndürür.

    yon "asagi": başlangıç, aşağı yuvarlanır (09:30 -> 09:00).
    yon "yukari": bitiş, yukarı yuvarlanır (10:20 -> 11:00).
    Yuvarlandıysa ya da takvim saatleri dışındaysa açıklama dolu döner (formda sarı görünür).
    """
    yazi = metin(deger)
    eslesme = re.match(r"^(\d{1,2})[:.](\d{2})$", yazi)
    if not eslesme or int(eslesme[1]) > 23 or int(eslesme[2]) > 59:
        return None, None
    saat, dakika = int(eslesme[1]), int(eslesme[2])
    aciklamalar = []
    if dakika != 0:
        if yon == "yukari":
            saat = min(saat + 1, 23)
        aciklamalar.append(f"saat yuvarlandı (belgede {yazi})")
    en_erken, en_gec = (ILK_SAAT, SON_SAAT - 1) if yon == "asagi" else (ILK_SAAT + 1, SON_SAAT)
    if not en_erken <= saat <= en_gec:
        aciklamalar.append(f"takvim saatleri ({ILK_SAAT:02d}:00-{SON_SAAT:02d}:00) dışında")
    return f"{saat:02d}:00", "; ".join(aciklamalar) or None


def syllabus_forma_cevir(ham):
    """Parser'ın döndürdüğü veriyi (syllabus.CIKTI_SEMASI) ders formunun beklediği biçime çevirir.

    (ders, uyarilar) döndürür. ders, elle ekleme formunu ön doldurmak için kullanılır;
    kaydedilirken elle girişle aynı doğrulamadan (dersi_dogrula) geçer.
    Dersteki ve satırlardaki "isaretler" sözlüğü: {alan adı: formda sarı gösterilme nedeni}.
    Bilgi uydurulmaz: bulunamayan ya da geçersiz gelen alan boş bırakılır.
    """
    def liste(deger):
        return deger if isinstance(deger, list) else []

    def emin_olmayanlar(satir):
        return [alan for alan in liste(satir.get("emin_olmayanlar")) if isinstance(alan, str)]

    ders = {
        "kod": metin(ham.get("kod")) or None,
        "ad": metin(ham.get("ad")) or None,
        "kredi": syllabus_sayisi(ham.get("kredi")),
        "akts": syllabus_sayisi(ham.get("akts")),
        "devamsizlik_hakki": syllabus_sayisi(ham.get("devamsizlik_yuzde"), en_fazla=100),
        "devamsizlik_metni": metin(ham.get("devamsizlik_metni")) or None,
        "oturumlar": [],
        "degerlendirmeler": [],
        "isaretler": {},
    }
    # Modelin emin olmadığı (ve dolu gelen) alanlar sarı işaretlenir.
    form_alanlari = {"devamsizlik_yuzde": "devamsizlik_hakki"}
    for alan in emin_olmayanlar(ham):
        alan = form_alanlari.get(alan, alan)
        if ders.get(alan) is not None and alan in ("kod", "ad", "kredi", "akts", "devamsizlik_hakki"):
            isaret_ekle(ders["isaretler"], alan, "model emin değil")

    oturum_turleri = [tur["anahtar"] for tur in OTURUM_TURLERI]
    for ham_oturum in liste(ham.get("oturumlar")):
        if not isinstance(ham_oturum, dict):
            continue
        gun_adi = metin(ham_oturum.get("gun"))
        baslangic, baslangic_notu = syllabus_saati(ham_oturum.get("baslangic"), "asagi")
        bitis, bitis_notu = syllabus_saati(ham_oturum.get("bitis"), "yukari")
        oturum = {
            "gun": syllabus.GUN_ADLARI.index(gun_adi) if gun_adi in syllabus.GUN_ADLARI else None,
            "baslangic": baslangic,
            "bitis": bitis,
            "derslik": metin(ham_oturum.get("derslik")) or None,
            "tur": ham_oturum.get("tur") if ham_oturum.get("tur") in oturum_turleri else None,
            "isaretler": {},
        }
        # Hiçbir bilgisi okunamamış satırı forma ekleme.
        if all(oturum[alan] is None for alan in ("gun", "baslangic", "bitis", "derslik")):
            continue
        if baslangic_notu:
            isaret_ekle(oturum["isaretler"], "baslangic", baslangic_notu)
        if bitis_notu:
            isaret_ekle(oturum["isaretler"], "bitis", bitis_notu)
        for alan in emin_olmayanlar(ham_oturum):
            if alan in ("gun", "baslangic", "bitis", "derslik", "tur") and oturum[alan] is not None:
                isaret_ekle(oturum["isaretler"], alan, "model emin değil")
        ders["oturumlar"].append(oturum)

    # Değerlendirme kalemleri: genel tür (vize, quiz...) formdaki sabit listeye yerleştirilir.
    tur_adlari = {tur["anahtar"]: tur["ad"] for tur in DEGERLENDIRME_TURLERI}
    dolu_turler = set()
    sigmayanlar = []
    for ham_kalem in liste(ham.get("degerlendirmeler")):
        if not isinstance(ham_kalem, dict):
            continue
        ad = metin(ham_kalem.get("ad"))
        agirlik = syllabus_sayisi(ham_kalem.get("agirlik"), en_fazla=EN_FAZLA_AGIRLIK)
        genel_tur = ham_kalem.get("tur") if ham_kalem.get("tur") in syllabus.KALEM_TURLERI else "diger"
        tur = bos_tur_bul(genel_tur, dolu_turler)
        if tur is None:
            sigmayanlar.append(f"{ad or genel_tur}" + (f" (%{agirlik:g})" if agirlik is not None else ""))
            continue
        dolu_turler.add(tur)

        tarih = metin(ham_kalem.get("tarih"))
        saat, saat_notu = syllabus_saati(ham_kalem.get("baslangic"), "asagi")
        bitis_saat, bitis_notu = syllabus_saati(ham_kalem.get("bitis"), "yukari")
        if saat is None:
            bitis_saat, bitis_notu = None, None   # bitiş, başlangıç olmadan anlamsız
        kalem = {
            "ad": ad,
            "tur": tur,
            "agirlik": agirlik,
            # Sadece belgede açıkça bonus/ekstra denmişse işaretli gelir; toplam %100'ü aşsa da uydurulmaz.
            "ekstra_puan": ham_kalem.get("ekstra_puan") is True,
            "tarih": tarih if tarih_gecerli_mi(tarih) else None,
            "saat": saat,
            "bitis_saat": bitis_saat,
            "isaretler": {},
        }
        # Kalem kendi türüne değil bir "Diğer" yerine konduysa belgedeki adı not olarak göster.
        if tur in DIGER_TURLERI and ad:
            isaret_ekle(kalem["isaretler"], "tur", f'belgede "{ad}"')
        if saat_notu:
            isaret_ekle(kalem["isaretler"], "saat", saat_notu)
        if bitis_notu:
            isaret_ekle(kalem["isaretler"], "bitis_saat", bitis_notu)
        form_alanlari = {"baslangic": "saat", "bitis": "bitis_saat"}
        for alan in emin_olmayanlar(ham_kalem):
            alan = form_alanlari.get(alan, alan)
            if (alan in ("tur", "agirlik", "ekstra_puan", "tarih", "saat", "bitis_saat")
                    and kalem[alan] is not None):
                isaret_ekle(kalem["isaretler"], alan, "model emin değil")
        ders["degerlendirmeler"].append(kalem)

    uyarilar = []
    if sigmayanlar:
        uyarilar.append(
            "Sığmayan kalemler (her tür derste bir kez kullanılabildiği için forma eklenemedi): "
            + ", ".join(sigmayanlar)
        )
    bos_mu = (ders["kod"] is None and ders["ad"] is None and ders["kredi"] is None
              and not ders["oturumlar"] and not ders["degerlendirmeler"])
    if bos_mu:
        raise SyllabusHatasi(
            "Bu dosyada ders bilgisi bulunamadı. Dosyanın bir syllabus (ders izlencesi) olduğundan emin ol.")
    return ders, uyarilar


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
        en_fazla_agirlik=EN_FAZLA_AGIRLIK,
        # JavaScript'in ihtiyaç duyduğu ayarlar (sayfaya JSON olarak yazılır).
        ayarlar={
            "renkler": RENKLER,
            "ilkSaat": ILK_SAAT,
            "sonSaat": SON_SAAT,
            "gunler": GUNLER,
            "bugun": bugun.isoformat(),
            "degerlendirmeTurleri": DEGERLENDIRME_TURLERI,
            "syllabusEnFazlaMB": SYLLABUS_EN_FAZLA_MB,
            "notOlcegi": NOT_OLCEGI,
            "yuzUzerindenTurler": YUZ_UZERINDEN_TURLER,
            "roundMode": ROUND_MODE,
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


# ============================================================
# SAĞ PANEL API'si (ders notları ve kalemlerden alınan puanlar)
# ============================================================

@app.route("/api/dersler/<int:ders_id>/notlar", methods=["PUT"])
def api_notlari_kaydet(ders_id):
    """Dersin serbest metin notlarını kaydeder (sağ paneldeki "Notlar" sekmesi)."""
    veri = request.get_json(silent=True) or {}
    notlar = veri.get("notlar")
    if notlar is not None and not isinstance(notlar, str):
        return jsonify({"hata": "Notlar metin olmalı."}), 400
    baglanti = veritabani_baglan()
    with baglanti:
        imlec = baglanti.execute("UPDATE dersler SET notlar = ? WHERE id = ?", (notlar or None, ders_id))
    baglanti.close()
    if imlec.rowcount == 0:
        return jsonify({"hata": "Ders bulunamadı."}), 404
    return jsonify({"kaydedildi": True})


@app.route("/api/degerlendirmeler/<int:kalem_id>/puan", methods=["PUT"])
def api_puani_kaydet(kalem_id):
    """Bir değerlendirme kaleminden alınan puanı kaydeder (boş = henüz açıklanmadı).

    Vize ve finalde puan 0-100 arasındadır; diğer kalemlerde 0 ile kalemin ağırlığı arasında.
    """
    veri = request.get_json(silent=True) or {}
    try:
        puan = sayiya_cevir(veri.get("alinan_puan"))
    except ValueError:
        puan = -1   # sayı değil: aşağıdaki aralık kontrolüne takılır
    baglanti = veritabani_baglan()
    kalem = baglanti.execute(
        "SELECT tur, agirlik FROM degerlendirmeler WHERE id = ?", (kalem_id,)
    ).fetchone()
    if kalem is None:
        baglanti.close()
        return jsonify({"hata": "Değerlendirme kalemi bulunamadı."}), 404
    en_fazla = 100 if kalem["tur"] in YUZ_UZERINDEN_TURLER else kalem["agirlik"]
    if puan is not None:
        puan = round(puan, 2)   # en fazla 2 ondalık basamak
        if not 0 <= puan <= en_fazla:
            baglanti.close()
            return jsonify({"hata": f"Puan 0 ile {en_fazla:g} arasında olmalı."}), 400
    with baglanti:
        baglanti.execute("UPDATE degerlendirmeler SET alinan_puan = ? WHERE id = ?", (puan, kalem_id))
    baglanti.close()
    return jsonify({"alinan_puan": puan})


# ============================================================
# SYLLABUS API'si
# ============================================================

@app.route("/api/syllabus", methods=["POST"])
def api_syllabus_oku():
    """Yüklenen syllabus'u (PDF/PNG/JPG) okur, ders formunu ön dolduracak veriyi döndürür.

    Hiçbir şey kaydetmez: ders ancak kullanıcı formu kontrol edip Kaydet'e basınca eklenir.
    Dosya saklanmaz: içerik bellekte işlenir. (Büyük yüklemelerde Flask'ın kullandığı geçici
    dosya da istek bitince kendiliğinden silinir.)
    Her hata {"hata": mesaj} olarak döner; uygulama çökmez.
    """
    en_fazla = SYLLABUS_EN_FAZLA_MB * 1024 * 1024
    boyut_mesaji = f"Dosya çok büyük. En fazla {SYLLABUS_EN_FAZLA_MB} MB'lık dosya yükleyebilirsin."
    try:
        dosya = request.files.get("dosya")
        if dosya is None:
            raise SyllabusHatasi("Dosya seçilmedi.")
        try:
            icerik = dosya.read(en_fazla + 1)
        finally:
            dosya.close()
        if len(icerik) > en_fazla:
            raise SyllabusHatasi(boyut_mesaji)
        mime_turu = dosya_turunu_bul(icerik)
        if mime_turu is None:
            raise SyllabusHatasi("Bu dosya türü desteklenmiyor. Lütfen PDF, PNG veya JPG dosyası seç.")
        ham = syllabus.parser_olustur(ENV_DOSYASI).oku(icerik, mime_turu)
        ders, uyarilar = syllabus_forma_cevir(ham)
    except SyllabusHatasi as hata:
        return jsonify({"hata": str(hata)}), 400
    except RequestEntityTooLarge:
        return jsonify({"hata": boyut_mesaji}), 413
    except Exception as hata:
        # Beklenmeyen hata: ayrıntı (ve olası gizli bilgi) kullanıcıya ya da kayda yazılmaz.
        app.logger.error("Syllabus okunurken beklenmeyen hata: %s", type(hata).__name__)
        return jsonify({"hata": "Syllabus okunurken beklenmeyen bir hata oluştu."}), 500
    return jsonify({"ders": ders, "uyarilar": uyarilar})


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
