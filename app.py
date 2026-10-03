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

# Ders renkleri ve yazı renkleri sadece burada tanımlı. Veritabanında rengin
# "anahtar"ı tutulur, böylece buradaki renk kodunu değiştirince eski dersler de yeni tonu alır.
# "yazi": o rengin üstündeki yazının rengi (açık zeminde koyu, koyu zeminde beyaz).
BEYAZ_YAZI = "#FFFFFF"
KOYU_YAZI = "#2B2B2B"

RENKLER = [
    {"anahtar": "kirmizi", "ad": "Kırmızı", "kod": "#E2503F", "yazi": BEYAZ_YAZI},
    {"anahtar": "mor", "ad": "Mor", "kod": "#8E2DA8", "yazi": BEYAZ_YAZI},
    {"anahtar": "limon", "ad": "Limon", "kod": "#D2DE57", "yazi": KOYU_YAZI},
    {"anahtar": "kahverengi", "ad": "Kahverengi", "kod": "#6D4C41", "yazi": BEYAZ_YAZI},
    {"anahtar": "civit", "ad": "Çivit", "kod": "#5E3BB0", "yazi": BEYAZ_YAZI},
    {"anahtar": "mavi", "ad": "Mavi", "kod": "#1E88E5", "yazi": BEYAZ_YAZI},
    {"anahtar": "turkuaz", "ad": "Turkuaz", "kod": "#00A98F", "yazi": BEYAZ_YAZI},
    {"anahtar": "pembe", "ad": "Pembe", "kod": "#E91E8C", "yazi": BEYAZ_YAZI},
]

OTURUM_TURLERI = [
    {"anahtar": "teori", "ad": "Teori"},
    {"anahtar": "lab", "ad": "Lab"},
    {"anahtar": "alistirma", "ad": "Alıştırma"},
]

DEGERLENDIRME_TURLERI = [
    {"anahtar": "vize", "ad": "Vize"},
    {"anahtar": "final", "ad": "Final"},
    {"anahtar": "quiz", "ad": "Quiz"},
    {"anahtar": "odev", "ad": "Ödev"},
    {"anahtar": "proje", "ad": "Proje"},
    {"anahtar": "diger", "ad": "Diğer"},
]

# "09:30" gibi 24 saatlik saat ve "2026-10-03" gibi tarih biçimleri.
SAAT_KALIBI = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
TARIH_KALIBI = re.compile(r"^\d{4}-\d{2}-\d{2}$")

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
    """Veritabanı dosyasını ve tabloları (yoksa) oluşturur."""
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
            notlar            TEXT
        );

        -- Bir dersin haftalık saatleri. Bir dersin birden çok oturumu olabilir.
        CREATE TABLE IF NOT EXISTS oturumlar (
            id        INTEGER PRIMARY KEY,
            ders_id   INTEGER NOT NULL REFERENCES dersler(id) ON DELETE CASCADE,
            gun       INTEGER NOT NULL,           -- 0 = Pzt ... 6 = Paz
            baslangic TEXT NOT NULL,              -- "09:30"
            bitis     TEXT NOT NULL,              -- "11:00"
            derslik   TEXT NOT NULL,
            tur       TEXT                        -- teori / lab / alistirma
        );

        -- Vize, final, ödev gibi not kalemleri. İleride not hesabı bunlardan yapılacak.
        CREATE TABLE IF NOT EXISTS degerlendirmeler (
            id      INTEGER PRIMARY KEY,
            ders_id INTEGER NOT NULL REFERENCES dersler(id) ON DELETE CASCADE,
            ad      TEXT NOT NULL,
            tur     TEXT NOT NULL,                -- vize / final / quiz / odev / proje / diger
            agirlik REAL NOT NULL,                -- yüzde, ör. 40
            tarih   TEXT,                         -- "2026-11-15"
            saat    TEXT                          -- "13:00"
        );
    """)
    baglanti.close()


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
            "SELECT id, ad, tur, agirlik, tarih, saat FROM degerlendirmeler"
            " WHERE ders_id = ? ORDER BY id",
            (ders["id"],),
        )]
    return dersler


def siradaki_renk(baglanti):
    """Henüz hiçbir derste kullanılmayan ilk rengin anahtarını döndürür."""
    kullanilanlar = [satir["renk"] for satir in baglanti.execute("SELECT renk FROM dersler")]
    for renk in RENKLER:
        if renk["anahtar"] not in kullanilanlar:
            return renk["anahtar"]
    # 8 rengin hepsi kullanıldıysa baştan başla.
    return RENKLER[len(kullanilanlar) % len(RENKLER)]["anahtar"]


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
    """Dersi ekler (ders_id yoksa) veya günceller. Dersin kimliğini döndürür."""
    degerler = [ders["kod"], ders["ad"], ders["kredi"], ders["akts"],
                ders["devamsizlik_hakki"], ders["renk"], ders["notlar"]]
    if ders_id is None:
        imlec = baglanti.execute(
            "INSERT INTO dersler (kod, ad, kredi, akts, devamsizlik_hakki, renk, notlar)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            degerler,
        )
        ders_id = imlec.lastrowid
    else:
        baglanti.execute(
            "UPDATE dersler SET kod = ?, ad = ?, kredi = ?, akts = ?,"
            " devamsizlik_hakki = ?, renk = ?, notlar = ? WHERE id = ?",
            degerler + [ders_id],
        )
    alt_satirlari_esitle(baglanti, "oturumlar",
                         ["gun", "baslangic", "bitis", "derslik", "tur"],
                         ders_id, ders["oturumlar"])
    alt_satirlari_esitle(baglanti, "degerlendirmeler",
                         ["ad", "tur", "agirlik", "tarih", "saat"],
                         ders_id, ders["degerlendirmeler"])
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


def dersi_dogrula(veri):
    """Formdan gelen dersi kontrol eder. (temiz_ders, hata_mesaji) döndürür.

    Her şey yolundaysa hata_mesaji None olur.
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
        if not SAAT_KALIBI.match(baslangic) or not SAAT_KALIBI.match(bitis):
            return None, "Oturum saatleri 09:30 biçiminde olmalı."
        # "09:30" < "11:00" karşılaştırması metin olarak da doğru çalışır.
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
    degerlendirmeler = []
    for kalem in veri.get("degerlendirmeler") or []:
        ad = metin(kalem.get("ad"))
        tur = metin(kalem.get("tur"))
        tarih = metin(kalem.get("tarih")) or None
        saat = metin(kalem.get("saat")) or None
        try:
            agirlik = sayiya_cevir(kalem.get("agirlik"))
        except ValueError:
            agirlik = None
        if not ad or tur not in degerlendirme_turleri or agirlik is None or agirlik < 0:
            return None, "Değerlendirme kalemlerinde ad, tür ve ağırlık zorunlu."
        if tarih is not None and not TARIH_KALIBI.match(tarih):
            return None, "Değerlendirme tarihi geçersiz."
        if saat is not None and not SAAT_KALIBI.match(saat):
            return None, "Değerlendirme saati 13:00 biçiminde olmalı."
        degerlendirmeler.append({"id": satir_kimligi(kalem), "ad": ad, "tur": tur,
                                 "agirlik": agirlik, "tarih": tarih, "saat": saat})

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
        "notlar": metin(veri.get("notlar")) or None,
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
        oturum_turleri=OTURUM_TURLERI,
        degerlendirme_turleri=DEGERLENDIRME_TURLERI,
        # JavaScript'in ihtiyaç duyduğu ayarlar (sayfaya JSON olarak yazılır).
        ayarlar={"renkler": RENKLER, "ilkSaat": ILK_SAAT, "sonSaat": SON_SAAT},
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
