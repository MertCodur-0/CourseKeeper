"""Demo sunucusundan videoda kullanılan ekran görüntülerini alır.

Önce başka bir terminalde demo sunucusunu başlat:   python video/demo/demo_sunucu.py
Sonra:                                               python video/demo/ekran_goruntuleri.py
Görüntüler video/public/screens klasörüne yazılır (3840x2160).
Gerekenler: pip install playwright && python -m playwright install chromium
"""
import sys
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright

CIKTI = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "public" / "screens"
CIKTI.mkdir(parents=True, exist_ok=True)
TEMA = "koyu"
ADRES = "http://127.0.0.1:5055/"
DEMO_SIMDI = datetime.fromisoformat("2026-11-25T11:30:00")

# Mac'te uygulamanın kendi fontu (SF Pro) kullanılır. Başka sistemlerde ona en yakın açık font: Inter.
FONT = "" if sys.platform == "darwin" else (
    "html, body, button, input, select, textarea { font-family: 'Inter', -apple-system, sans-serif !important; }")

ON_AYAR = f"""
Object.defineProperty(navigator, 'platform', {{get: () => 'MacIntel'}});
localStorage.setItem('derstakip.tema', '{TEMA}');
localStorage.setItem('derstakip.ad', 'Deniz');
localStorage.setItem('derstakip.sehir', JSON.stringify({{ad: 'Ankara', enlem: 39.92, boylam: 32.85}}));
"""


def ac(tarayici, tema=None):
    # Mac'teki gibi görünsün: Türkçe tarih biçimi, ⌘K kısayolu. 2x: videoda yakınlaştırınca net kalsın.
    sayfa = tarayici.new_page(
        viewport={"width": 1920, "height": 1080}, device_scale_factor=2, locale="tr-TR",
        timezone_id="Europe/Istanbul",
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")
    sayfa.clock.install(time=DEMO_SIMDI)
    sayfa.clock.pause_at(DEMO_SIMDI)
    sayfa.add_init_script(ON_AYAR.replace(f"'{TEMA}'", f"'{tema or TEMA}'"))
    sayfa.goto(ADRES)
    if FONT:
        sayfa.add_style_tag(content=FONT)
    sayfa.clock.run_for(3000)
    sayfa.wait_for_load_state("networkidle")
    return sayfa


def cek(sayfa, ad):
    sayfa.mouse.move(120, 640)   # imleci boş bir yere çek (üzerine gelince çıkan düğmeler görünmesin)
    sayfa.clock.run_for(1500)
    sayfa.screenshot(path=str(CIKTI / f"{ad}.png"))
    print("kaydedildi:", ad)


# Syllabus okuma için örnek model yanıtı: uygulamanın kendi syllabus_forma_cevir'i ile forma çevrilir.
ORNEK_SYLLABUS = {
    "kod": "CMPE 232_01", "ad": "Object-Oriented Programming", "kredi": 3, "akts": 6,
    "devamsizlik_yuzde": None, "devamsizlik_metni": None, "lab_devamsizlik_yuzde": None,
    "zorunlu_katilim_yuzde": 70, "lab_zorunlu_katilim_yuzde": None, "emin_olmayanlar": ["akts"],
    "oturumlar": [
        {"gun": "persembe", "baslangic": "13:00", "bitis": "15:00", "derslik": "A-104", "tur": "teori", "emin_olmayanlar": []},
        {"gun": "cuma", "baslangic": "15:30", "bitis": "17:20", "derslik": "Lab 2", "tur": "lab", "emin_olmayanlar": []},
    ],
    "degerlendirmeler": [
        {"ad": "Midterm", "tur": "vize", "agirlik": 30, "ekstra_puan": False, "tarih": "2026-11-26", "baslangic": "13:00", "bitis": "15:00", "emin_olmayanlar": []},
        {"ad": "Lab work", "tur": "lab", "agirlik": 20, "ekstra_puan": False, "tarih": None, "baslangic": None, "bitis": None, "emin_olmayanlar": []},
        {"ad": "Final", "tur": "final", "agirlik": 50, "ekstra_puan": False, "tarih": "2027-01-19", "baslangic": "09:00", "bitis": "11:00", "emin_olmayanlar": ["tarih"]},
    ],
}


def syllabus_yaniti():
    import json, os, sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))   # proje klasörü
    import app as uygulama
    ders, uyarilar = uygulama.syllabus_forma_cevir(ORNEK_SYLLABUS)
    return json.dumps({"ders": ders, "uyarilar": uyarilar})


def sahneler(t):
    s = ac(t)
    cek(s, "yoklama-bekleyen")
    s.click("#yoklama-sonra")
    cek(s, "takvim")

    # Ders paneli: not hesabı (CMPE 211)
    s.locator('.ders-blogu[data-ders-id="1"]').first.click()
    cek(s, "ders-not-hesabi")
    # Devamsızlık (PHYS 102: uyarı)
    s.locator('.ders-blogu[data-ders-id="4"]').first.click()
    s.click("#sekme-devamsizlik")
    cek(s, "ders-devamsizlik")
    s.click("#panel-geri")
    s.clock.run_for(600)

    # Arama
    s.keyboard.press("Meta+k")
    s.keyboard.type("final")
    s.clock.run_for(800)
    cek(s, "arama")
    s.keyboard.press("Escape")
    s.mouse.click(5, 1075)

    # GPA
    s.click('[data-oge="gpa"]')
    cek(s, "gpa")
    s.keyboard.press("Escape")
    s.clock.run_for(800)

    # Akademik takvim
    s.click('[data-oge="akademik"]')
    cek(s, "akademik-takvim")
    s.keyboard.press("Escape")
    s.clock.run_for(800)

    s.close()

    # Syllabus: seçim ekranı, dosya alanı, okunan form
    s = ac(t)
    s.click("#yoklama-sonra")
    s.route("**/api/syllabus", lambda r: r.fulfill(status=200, content_type="application/json", body=syllabus_yaniti()))
    s.click("#ders-ekle")
    cek(s, "ders-ekle-secim")
    s.click("#syllabus-ekle")
    cek(s, "syllabus-yukle")
    s.set_input_files("#dosya-girdisi", files=[{"name": "CMPE232_syllabus.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 demo"}])
    s.clock.run_for(1500)
    cek(s, "syllabus-form")
    s.close()

    # Açık tema
    s = ac(t, "acik")
    s.click("#yoklama-sonra")
    cek(s, "takvim-acik")
    s.close()


if __name__ == "__main__":
    with sync_playwright() as p:
        t = p.chromium.launch(args=["--lang=tr-TR"], env={**__import__("os").environ, "LANG": "tr_TR.UTF-8", "LANGUAGE": "tr"})
        sahneler(t)
        t.close()
