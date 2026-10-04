"""Tanıtım videosu için demo sunucusu.

Uygulamayı UYDURMA bir öğrencinin verileriyle, ayrı bir veritabanında çalıştırır:
- Gerçek derstakip.db'ye dokunmaz (demo.db kullanılır).
- "Şimdi" sabit bir tarihe ayarlanır (DERSTAKIP_NOW), böylece görüntüler her seferinde aynı olur.
- Hava durumu internete gitmeden örnek bir yanıtla gelir (uygulamanın kendi işleme kodu kullanılır).

Kullanım (proje klasöründen):  python video/demo/demo_sunucu.py
(Sunucu http://127.0.0.1:5055 adresinde açılır. Sadece veritabanını doldurmak için: --sadece-doldur)
"""

import os
import sys
from datetime import date, timedelta
from pathlib import Path

DEMO_SIMDI = "2026-11-25T11:30"
os.environ["DERSTAKIP_NOW"] = DEMO_SIMDI

PROJE = Path(__file__).resolve().parents[2]   # proje klasörü
sys.path.insert(0, str(PROJE))

import app as uygulama  # noqa: E402
import hava  # noqa: E402

DEMO_DB = Path(__file__).resolve().parent / "demo.db"
uygulama.VERITABANI_DOSYASI = DEMO_DB
hava.ONBELLEK_DOSYASI = Path(__file__).resolve().parent / "demo_hava.json"


def _ornek_hava(adres, parametreler):
    """Open-Meteo yerine örnek yanıt (biçim Open-Meteo ile aynı)."""
    if "geocoding" in adres:
        return {"results": [{"name": "Ankara", "admin1": "Ankara", "country": "Türkiye",
                             "latitude": 39.92, "longitude": 32.85}]}
    gun = date.fromisoformat(DEMO_SIMDI[:10])
    return {
        "current": {"temperature_2m": 9.4, "apparent_temperature": 7.1, "is_day": 1,
                    "weather_code": 2, "wind_speed_10m": 11.2},
        "daily": {
            "time": [(gun + timedelta(days=i)).isoformat() for i in range(4)],
            "weather_code": [2, 61, 3, 1],
            "temperature_2m_max": [11.0, 8.6, 9.8, 12.3],
            "temperature_2m_min": [2.1, 3.4, 1.8, 0.9],
            "precipitation_probability_max": [10, 70, 30, 5],
        },
    }


hava._istek = _ornek_hava


class _DemoSaati(hava.datetime):
    """Hava kartındaki "güncellendi" saati de demo zamanını göstersin."""
    @classmethod
    def now(cls, tz=None):
        return cls.fromisoformat(DEMO_SIMDI)


hava.datetime = _DemoSaati


# ---------------------------------------------------------------- demo verisi

DONEM = {
    "ad": "2026-2027 Güz",
    "baslangic": "2026-09-28", "bitis": "2027-01-08",
    "final_baslangic": "2027-01-11", "final_bitis": "2027-01-24",
    "ders_disi_tarihler": [
        {"tur": "tatil", "ad": "Cumhuriyet Bayramı", "baslangic": "2026-10-29", "bitis": "2026-10-29"},
        {"tur": "sinav", "ad": "Ara sınav haftası", "baslangic": "2026-11-16", "bitis": "2026-11-20"},
        {"tur": "tatil", "ad": "Yılbaşı", "baslangic": "2027-01-01", "bitis": "2027-01-01"},
    ],
}


def oturum(gun, bas, bit, derslik, tur="teori"):
    return {"gun": gun, "baslangic": bas, "bitis": bit, "derslik": derslik, "tur": tur}


def kalem(tur, agirlik, ad="", tarih=None, saat=None, bitis=None, puan=None, ekstra=False):
    return {"tur": tur, "agirlik": agirlik, "ad": ad, "tarih": tarih, "saat": saat,
            "bitis_saat": bitis, "ekstra_puan": ekstra, "_puan": puan}


DERSLER = [
    {"kod": "CMPE 211", "ad": "Data Structures", "kredi": 3, "akts": 6, "devamsizlik_hakki": 30,
     "lab_devamsizlik_hakki": 20, "hedef_not": "AA", "renk": "mavi",
     "notlar": "Proje: AVL ağacı + test raporu.\nOfis saati: Salı 14:00, A-312.",
     "oturumlar": [oturum(0, "09:00", "11:00", "A-201"), oturum(2, "13:00", "15:00", "A-201"),
                   oturum(3, "15:00", "17:00", "Lab 3", "lab")],
     "degerlendirmeler": [kalem("vize1", 25, "Midterm", "2026-11-17", "10:00", "12:00", 88),
                          kalem("lab", 15, "Lab assignments", puan=13),
                          kalem("proje", 20, "Term project", "2026-12-18"),
                          kalem("final", 40, "Final", "2027-01-14", "09:00", "11:00")]},
    {"kod": "CMPE 223", "ad": "Digital Logic Design", "kredi": 3, "akts": 5, "devamsizlik_hakki": 30,
     "hedef_not": "BA", "renk": "turkuaz",
     "oturumlar": [oturum(1, "09:00", "12:00", "B-104")],
     "degerlendirmeler": [kalem("vize1", 30, "Midterm", "2026-11-19", "13:00", "15:00", 76),
                          kalem("quiz", 10, "Quizzes", "2026-11-26", "11:00", "12:00"),
                          kalem("odev", 20, "Homework", puan=17),
                          kalem("final", 40, "Final", "2027-01-15", "13:00", "15:00")]},
    {"kod": "MATH 241", "ad": "Linear Algebra", "kredi": 4, "akts": 6, "devamsizlik_hakki": 30,
     "hedef_not": "BB", "renk": "kehribar",
     "oturumlar": [oturum(0, "13:00", "15:00", "C-12"), oturum(3, "10:00", "12:00", "C-12")],
     "degerlendirmeler": [kalem("vize1", 25, "Midterm 1", "2026-10-27", "15:00", "17:00", 78),
                          kalem("vize2", 25, "Midterm 2", "2026-11-27", "13:00", "15:00"),
                          kalem("final", 50, "Final", "2027-01-18", "10:00", "12:00")]},
    {"kod": "PHYS 102", "ad": "Physics II", "kredi": 4, "akts": 6, "devamsizlik_hakki": 30,
     "lab_devamsizlik_hakki": 20, "hedef_not": "CB", "renk": "pembe",
     "oturumlar": [oturum(1, "13:00", "15:00", "D-Amfi"), oturum(4, "09:00", "11:00", "D-Amfi"),
                   oturum(4, "13:00", "15:00", "Fizik Lab", "lab")],
     "degerlendirmeler": [kalem("vize1", 30, "Midterm", "2026-11-18", "15:00", "17:00", 64),
                          kalem("lab", 20, "Lab reports", puan=16),
                          kalem("final", 50, "Final", "2027-01-20", "13:00", "15:00")]},
    {"kod": "ENG 202", "ad": "Technical Communication", "kredi": 2, "akts": 3, "devamsizlik_hakki": 20,
     "hedef_not": "AA", "renk": "mor",
     "oturumlar": [oturum(2, "16:00", "18:00", "E-301")],
     "degerlendirmeler": [kalem("odev", 30, "Writing assignments", puan=27),
                          kalem("proje", 30, "Group presentation", "2026-12-09", "16:00", "18:00"),
                          kalem("final", 40, "Final report", "2027-01-12"),
                          kalem("diger1", 5, "Bonus: conference summary", puan=4, ekstra=True)]},
]

# Devamsızlık: (ders kodu, oturum sırası, tarih) -> durum. Geri kalan geçmiş dersler "katildi".
OZEL_YOKLAMA = {
    ("PHYS 102", 1, "2026-10-09"): "katilmadi",
    ("PHYS 102", 1, "2026-10-23"): "katilmadi",
    ("PHYS 102", 0, "2026-11-03"): "katilmadi",
    ("PHYS 102", 1, "2026-11-06"): "katilmadi",
    ("PHYS 102", 0, "2026-10-13"): "katilmadi",
    ("PHYS 102", 0, "2026-11-10"): "katilmadi",
    ("PHYS 102", 1, "2026-11-13"): "katilmadi",
    ("PHYS 102", 2, "2026-10-16"): "katilmadi",
    ("MATH 241", 1, "2026-10-15"): "katilmadi",
    ("CMPE 223", 0, "2026-10-06"): "alinmadi",
    ("ENG 202", 0, "2026-11-11"): "iptal",
}
# Bu derslerin bu hafta henüz girilmemiş yoklaması bırakılır (rozet için).
GIRILMEYEN_SON_GUN = "2026-11-23"


def doldur():
    if DEMO_DB.exists():
        DEMO_DB.unlink()
    hava.ONBELLEK_DOSYASI.unlink(missing_ok=True)
    hava._onbellek.clear()
    uygulama.veritabani_hazirla()
    istemci = uygulama.app.test_client()

    assert istemci.put("/api/donem", json=DONEM).status_code == 200
    assert istemci.put("/api/gpa", json={"onceki_kredi": 34, "onceki_gpa": 3.12, "hedef_gpa": 3.25,
                                         "kredi_birimi": "kredi"}).status_code == 200

    tatiller = []
    for satir in DONEM["ders_disi_tarihler"]:
        g = date.fromisoformat(satir["baslangic"])
        while g <= date.fromisoformat(satir["bitis"]):
            tatiller.append(g)
            g += timedelta(days=1)

    simdi = date.fromisoformat(DEMO_SIMDI[:10])
    for ders in DERSLER:
        govde = {k: v for k, v in ders.items() if k != "notlar"}
        govde["degerlendirmeler"] = [{k: v for k, v in d.items() if k != "_puan"} for d in ders["degerlendirmeler"]]
        yanit = istemci.post("/api/dersler", json=govde)
        assert yanit.status_code == 201, yanit.get_json()
        ders_id = yanit.get_json()["id"]
        if ders.get("notlar"):
            istemci.put(f"/api/dersler/{ders_id}/notlar", json={"notlar": ders["notlar"]})

    for kayitli in istemci.get("/api/dersler").get_json()["dersler"]:
        tanim = next(d for d in DERSLER if d["kod"] == kayitli["kod"])
        for kalem_kayit, kalem_tanim in zip(kayitli["degerlendirmeler"], tanim["degerlendirmeler"]):
            if kalem_tanim["_puan"] is not None:
                istemci.put(f"/api/degerlendirmeler/{kalem_kayit['id']}/puan",
                            json={"alinan_puan": kalem_tanim["_puan"]})

        # Oturumların tanımdaki sırası (kayıtlılar gün/saate göre sıralı gelir).
        sira = {(o["gun"], o["baslangic"]): i for i, o in enumerate(tanim["oturumlar"])}
        kayitlar = []
        for o in kayitli["oturumlar"]:
            i = sira[(o["gun"], o["baslangic"])]
            g = date.fromisoformat(DONEM["baslangic"]) + timedelta(days=o["gun"])
            while g < simdi:
                if g not in tatiller and g.isoformat() < GIRILMEYEN_SON_GUN:
                    durum = OZEL_YOKLAMA.get((kayitli["kod"], i, g.isoformat()), "katildi")
                    for dilim in uygulama.oturum_dilimleri(o["baslangic"], o["bitis"]):
                        kayitlar.append({"oturum_id": o["id"], "tarih": g.isoformat(),
                                         "dilim": dilim, "durum": durum})
                g += timedelta(days=7)
        if kayitlar:
            yanit = istemci.put("/api/yoklama", json={"kayitlar": kayitlar})
            assert yanit.status_code == 200, yanit.get_json()
    print("Demo verisi hazır:", DEMO_DB)


if __name__ == "__main__":
    doldur()
    if "--sadece-doldur" not in sys.argv:
        uygulama.app.run(host="127.0.0.1", port=5055, debug=False)
