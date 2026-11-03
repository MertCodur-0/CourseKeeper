"""Sunucu tarafı testleri: ders doğrulama, puan sınırları, dönem ve otomatik yedek.

Çalıştırma (proje klasöründe): venv/bin/python -m unittest discover tests
Testler gerçek veritabanına dokunmaz: her test geçici bir klasörde boş bir veritabanıyla çalışır.
"""
import shutil
import sqlite3
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app  # noqa: E402


def ornek_ders(**degisiklikler):
    """Geçerli bir ders: bir teori, bir online oturum; vize, final ve quiz."""
    ders = {
        "kod": "CMPE 114",
        "kredi": 3,
        "akts": 6,
        "hedef_not": "BB",
        "oturumlar": [
            {"gun": 0, "baslangic": "09:00", "bitis": "11:00", "derslik": "A101", "tur": "teori"},
            {"gun": 2, "baslangic": "13:00", "bitis": "14:00", "derslik": "", "tur": "online"},
        ],
        "degerlendirmeler": [
            {"tur": "vize1", "agirlik": 30},
            {"tur": "final", "agirlik": 50},
            {"tur": "quiz", "agirlik": 20},
        ],
    }
    ders.update(degisiklikler)
    return ders


class GeciciVeritabaniTesti(unittest.TestCase):
    """Her testten önce geçici klasörde boş bir veritabanı kurar, sonra siler."""

    def setUp(self):
        self.klasor = Path(tempfile.mkdtemp())
        self.eski_ayarlar = {ad: getattr(app, ad) for ad in
                             ("VERITABANI_DOSYASI", "YEDEK_KLASORU", "SYLLABUS_KLASORU", "GECICI_SYLLABUS_KLASORU")}
        app.VERITABANI_DOSYASI = self.klasor / "derstakip.db"
        app.YEDEK_KLASORU = self.klasor / "yedekler"
        app.SYLLABUS_KLASORU = self.klasor / "uploads" / "syllabus"
        app.GECICI_SYLLABUS_KLASORU = app.SYLLABUS_KLASORU / "gecici"
        app.son_yedek_gunu = None
        app.veritabani_hazirla()
        self.istemci = app.app.test_client()

    def tearDown(self):
        for ad, deger in self.eski_ayarlar.items():
            setattr(app, ad, deger)
        app.son_yedek_gunu = None
        shutil.rmtree(self.klasor)

    def ders_ekle(self, **degisiklikler):
        yanit = self.istemci.post("/api/dersler", json=ornek_ders(**degisiklikler))
        self.assertEqual(yanit.status_code, 201, yanit.get_json())
        return yanit.get_json()["id"]

    def dersi_getir(self, ders_id):
        dersler = self.istemci.get("/api/dersler").get_json()["dersler"]
        return next(ders for ders in dersler if ders["id"] == ders_id)


class DersDogrulamaTesti(unittest.TestCase):
    def hata(self, **degisiklikler):
        return app.dersi_dogrula(ornek_ders(**degisiklikler))[1]

    def test_gecerli_ders(self):
        self.assertIsNone(self.hata())

    def test_zorunlu_alanlar(self):
        self.assertEqual(self.hata(kod=""), "Ders kodu zorunlu.")
        self.assertEqual(self.hata(kredi=None), "Kredi zorunlu ve 0 veya daha büyük olmalı.")
        self.assertEqual(self.hata(oturumlar=[]), "En az 1 oturum gerekli.")

    def test_hedef_not_sadece_aa_ile_dd_arasi(self):
        self.assertEqual(self.hata(hedef_not=""), "Hedef harf notu zorunlu.")
        self.assertEqual(self.hata(hedef_not="F"), "Hedef harf notu zorunlu.")
        self.assertIsNone(self.hata(hedef_not="DD"))

    def test_derslik_online_disinda_zorunlu(self):
        oturum = {"gun": 0, "baslangic": "09:00", "bitis": "10:00", "derslik": ""}
        self.assertIsNone(self.hata(oturumlar=[{**oturum, "tur": "online"}]))
        self.assertEqual(self.hata(oturumlar=[{**oturum, "tur": "teori"}]),
                         "Teori ve lab oturumlarında derslik zorunlu.")
        self.assertEqual(self.hata(oturumlar=[{**oturum, "tur": "lab"}]),
                         "Teori ve lab oturumlarında derslik zorunlu.")

    def test_saatler_tam_saat_ve_sirali(self):
        oturum = {"gun": 0, "derslik": "A101", "tur": "teori"}
        self.assertEqual(self.hata(oturumlar=[{**oturum, "baslangic": "09:30", "bitis": "11:00"}]),
                         "Oturum saatleri tam saat olmalı (ör. 09:00).")
        self.assertEqual(self.hata(oturumlar=[{**oturum, "baslangic": "11:00", "bitis": "11:00"}]),
                         "Bitiş saati başlangıçtan sonra olmalı.")

    def test_ayni_degerlendirme_turu_bir_kez(self):
        kalemler = [{"tur": "quiz", "agirlik": 10}, {"tur": "quiz", "agirlik": 10}]
        self.assertEqual(self.hata(degerlendirmeler=kalemler),
                         "Aynı değerlendirme türü bir derste en fazla bir kez kullanılabilir.")

    def test_toplam_yuzu_asabilir(self):
        # Ekstra puan için toplam %100'ü aşabilir; tek kalemin sınırı EN_FAZLA_AGIRLIK.
        kalemler = [{"tur": "vize1", "agirlik": 50}, {"tur": "final", "agirlik": 60},
                    {"tur": "proje", "agirlik": 10, "ekstra_puan": True}]
        self.assertIsNone(self.hata(degerlendirmeler=kalemler))
        self.assertIsNotNone(self.hata(degerlendirmeler=[{"tur": "final", "agirlik": app.EN_FAZLA_AGIRLIK + 1}]))


class HarfTablosuTesti(unittest.TestCase):
    def test_araliklar_olcekten_uretilir(self):
        araliklar = {satir["harf"]: satir["aralik"] for satir in app.harf_tablosu()}
        self.assertEqual(araliklar, {"AA": "90-100", "BA": "85-89", "BB": "80-84", "CB": "75-79",
                                     "CC": "70-74", "DC": "60-69", "DD": "50-59", "F": "0-49"})


class DersApiTesti(GeciciVeritabaniTesti):
    def test_ders_eklenir_ve_listelenir(self):
        ders = self.dersi_getir(self.ders_ekle())
        self.assertEqual(ders["kod"], "CMPE 114")
        self.assertEqual(len(ders["oturumlar"]), 2)
        self.assertEqual(len(ders["degerlendirmeler"]), 3)

    def test_gecersiz_ders_kaydedilmez(self):
        yanit = self.istemci.post("/api/dersler", json=ornek_ders(kod=""))
        self.assertEqual(yanit.status_code, 400)
        self.assertEqual(self.istemci.get("/api/dersler").get_json()["dersler"], [])

    def test_duzenlemede_oturum_kimlikleri_korunur(self):
        ders = self.dersi_getir(self.ders_ekle())
        oturumlar = [{**oturum} for oturum in ders["oturumlar"]]
        oturumlar[0]["derslik"] = "B202"
        yanit = self.istemci.put(f"/api/dersler/{ders['id']}",
                                 json=ornek_ders(oturumlar=oturumlar, degerlendirmeler=ders["degerlendirmeler"]))
        self.assertEqual(yanit.status_code, 200)
        yeni = self.dersi_getir(ders["id"])
        self.assertEqual([o["id"] for o in yeni["oturumlar"]], [o["id"] for o in ders["oturumlar"]])
        self.assertEqual(yeni["oturumlar"][0]["derslik"], "B202")

    def puan_gir(self, kalem, puan):
        return self.istemci.put(f"/api/degerlendirmeler/{kalem['id']}/puan", json={"alinan_puan": puan})

    def test_puan_sinirlari(self):
        kalemler = {k["tur"]: k for k in self.dersi_getir(self.ders_ekle())["degerlendirmeler"]}
        # Vize ve final 100 üzerinden girilir.
        self.assertEqual(self.puan_gir(kalemler["vize1"], 100).status_code, 200)
        self.assertEqual(self.puan_gir(kalemler["vize1"], 101).status_code, 400)
        # Quiz (ağırlık 20): girilen değer doğrudan puandır, en fazla ağırlık kadar.
        self.assertEqual(self.puan_gir(kalemler["quiz"], 20).status_code, 200)
        self.assertEqual(self.puan_gir(kalemler["quiz"], 21).status_code, 400)
        self.assertEqual(self.puan_gir(kalemler["quiz"], -1).status_code, 400)
        # Boş = henüz açıklanmadı.
        self.assertEqual(self.puan_gir(kalemler["quiz"], None).get_json(), {"alinan_puan": None})


class DonemTesti(GeciciVeritabaniTesti):
    def test_donem_kaydedilir(self):
        veri = {"baslangic": "2026-09-28", "bitis": "2027-01-08",
                "ders_disi_tarihler": [{"tur": "tatil", "baslangic": "2026-10-29", "bitis": "2026-10-29"}]}
        yanit = self.istemci.put("/api/donem", json=veri)
        self.assertEqual(yanit.status_code, 200)
        self.assertEqual(len(yanit.get_json()["ders_disi_tarihler"]), 1)

    def test_bitis_baslangictan_once_olamaz(self):
        yanit = self.istemci.put("/api/donem", json={"baslangic": "2027-01-08", "bitis": "2026-09-28"})
        self.assertEqual(yanit.status_code, 400)


class YedekTesti(GeciciVeritabaniTesti):
    def yedekler(self):
        return sorted(yol.name for yol in app.YEDEK_KLASORU.glob("*.db"))

    def test_gunde_bir_yedek_alinir(self):
        self.ders_ekle()   # bu istek de günün yedeğini alır (ders eklenmeden önceki hali)
        shutil.rmtree(app.YEDEK_KLASORU)
        app.son_yedek_gunu = None
        app.gunluk_yedek_al()
        app.son_yedek_gunu = None   # sunucunun yeniden açılması gibi
        app.gunluk_yedek_al()
        self.assertEqual(self.yedekler(), [f"derstakip.backup-{date.today().isoformat()}.db"])
        # Yedek, veriyi içeren gerçek bir SQLite dosyasıdır.
        baglanti = sqlite3.connect(app.YEDEK_KLASORU / self.yedekler()[0])
        self.assertEqual(baglanti.execute("SELECT kod FROM dersler").fetchone()[0], "CMPE 114")
        baglanti.close()

    def test_ilk_istekte_yedek_alinir(self):
        self.istemci.get("/api/dersler")
        self.assertEqual(len(self.yedekler()), 1)

    def test_sadece_son_gunler_tutulur(self):
        app.YEDEK_KLASORU.mkdir()
        for gun in range(1, 11):
            (app.YEDEK_KLASORU / f"derstakip.backup-2020-01-{gun:02d}.db").touch()
        elle_alinan = app.YEDEK_KLASORU / "derstakip.backup-2020-01-01-2222.db"
        elle_alinan.touch()
        app.gunluk_yedek_al()
        gunlukler = [ad for ad in self.yedekler() if ad != elle_alinan.name]
        self.assertEqual(len(gunlukler), app.YEDEK_SAYISI)
        self.assertIn(f"derstakip.backup-{date.today().isoformat()}.db", gunlukler)
        self.assertTrue(elle_alinan.exists())   # günlük olmayan yedeklere dokunulmaz

    def test_veritabani_yoksa_yedek_alinmaz(self):
        app.VERITABANI_DOSYASI.unlink()
        app.gunluk_yedek_al()
        self.assertFalse(app.YEDEK_KLASORU.exists())


if __name__ == "__main__":
    unittest.main()
