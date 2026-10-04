"""Hava durumu ve şehir arama: Open-Meteo (anahtarsız) üzerinden.

- sehir_ara  : şehir adından koordinat bulur (geocoding).
- hava_getir : bir koordinatın şu anki havasını ve 4 günlük tahminini getirir.

Güvenlik ve gizlilik:
- Sunucu SADECE aşağıdaki iki sabit adrese istek atar; kullanıcıdan adres alınmaz.
- Koordinatlar 2 ondalığa yuvarlanır (yaklaşık 1 km); tam konum hiçbir yere gönderilmez.
- Hata mesajlarına ve kayıtlara adres ya da koordinat yazılmaz.

Sonuç 30 dakika önbellekte tutulur (bellekte ve proje klasöründeki küçük bir dosyada; dosya
git'e eklenmez). İnternet yoksa önbellekteki son veri "çevrimdışı" işaretiyle döner.
"""

import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

# İstek atılan adresler: sadece bu ikisi. (Güncel adlar: https://open-meteo.com/en/docs)
HAVA_ADRESI = "https://api.open-meteo.com/v1/forecast"
SEHIR_ARAMA_ADRESI = "https://geocoding-api.open-meteo.com/v1/search"

ZAMAN_ASIMI = 8                 # saniye
ONBELLEK_SURESI = 30 * 60       # saniye: bu kadar yeni veri varsa yeniden istenmez
GUN_SAYISI = 4                  # bugün + 3 gün
ONBELLEK_DOSYASI = Path(__file__).parent / "hava_onbellek.json"

# Bellekteki önbellek: {"41.01,28.95": {"zaman": saniye, "veri": {...}}}
_onbellek = {}


class HavaHatasi(Exception):
    """Hava durumu alınamadığında fırlatılır. Mesajı kullanıcıya gösterilecek sade Türkçe metindir."""


# WMO hava kodları -> (Türkçe durum yazısı, simge adı). Simgelerin çizimi static/hava.js'tedir.
# "acik" ve "az-bulutlu" simgelerinin gündüz/gece (güneş/ay) hali tarayıcıda seçilir.
HAVA_KODLARI = {
    0: ("Açık", "acik"),
    1: ("Az bulutlu", "az-bulutlu"),
    2: ("Parçalı bulutlu", "az-bulutlu"),
    3: ("Bulutlu", "bulut"),
    45: ("Sis", "sis"), 48: ("Sis", "sis"),
    51: ("Çisenti", "yagmur"), 53: ("Çisenti", "yagmur"), 55: ("Çisenti", "yagmur"),
    56: ("Çisenti", "yagmur"), 57: ("Çisenti", "yagmur"),
    61: ("Yağmurlu", "yagmur"), 63: ("Yağmurlu", "yagmur"), 65: ("Yağmurlu", "yagmur"),
    66: ("Yağmurlu", "yagmur"), 67: ("Yağmurlu", "yagmur"),
    71: ("Kar", "kar"), 73: ("Kar", "kar"), 75: ("Kar", "kar"), 77: ("Kar", "kar"),
    80: ("Sağanak", "yagmur"), 81: ("Sağanak", "yagmur"), 82: ("Sağanak", "yagmur"),
    85: ("Kar", "kar"), 86: ("Kar", "kar"),
    95: ("Gök gürültülü fırtına", "firtina"), 96: ("Gök gürültülü fırtına", "firtina"),
    99: ("Gök gürültülü fırtına", "firtina"),
}
BILINMEYEN_HAVA = ("Değişken", "bulut")


def _istek(adres, parametreler):
    """Sabit adreslerden birine GET isteği atar, JSON yanıtı sözlük olarak döndürür.

    Sorun olursa HavaHatasi fırlatır; mesajda adres ya da koordinat yer almaz.
    """
    tam_adres = adres + "?" + urllib.parse.urlencode(parametreler)
    try:
        with urllib.request.urlopen(tam_adres, timeout=ZAMAN_ASIMI) as yanit:
            return json.loads(yanit.read().decode("utf-8"))
    except (socket.timeout, TimeoutError):
        raise HavaHatasi("Hava durumu servisi zamanında yanıt vermedi.") from None
    except urllib.error.HTTPError as hata:
        raise HavaHatasi(f"Hava durumu servisi isteği kabul etmedi (hata {hata.code}).") from None
    except (urllib.error.URLError, OSError):
        raise HavaHatasi("Hava durumu servisine ulaşılamadı. İnternet bağlantını kontrol et.") from None
    except ValueError:
        raise HavaHatasi("Hava durumu servisinden anlaşılır bir yanıt alınamadı.") from None


def sehir_ara(aranan):
    """Şehir adına göre en fazla 6 yer döndürür: [{ad, bolge, ulke, enlem, boylam}]."""
    aranan = (aranan or "").strip()[:60]
    if len(aranan) < 2:
        return []
    yanit = _istek(SEHIR_ARAMA_ADRESI, {"name": aranan, "count": 6, "language": "tr", "format": "json"})
    sehirler = []
    # Sonuç yoksa yanıtta "results" alanı hiç bulunmaz.
    for yer in yanit.get("results") or []:
        try:
            sehirler.append({
                "ad": str(yer["name"]),
                "bolge": str(yer.get("admin1") or ""),
                "ulke": str(yer.get("country") or ""),
                "enlem": round(float(yer["latitude"]), 2),
                "boylam": round(float(yer["longitude"]), 2),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return sehirler


def _durum(kod):
    yazi, simge = HAVA_KODLARI.get(kod, BILINMEYEN_HAVA)
    return {"durum": yazi, "simge": simge}


def _sadelestir(yanit):
    """Open-Meteo yanıtından sadece kullanılan alanları alır (eksik alan varsa KeyError/TypeError)."""
    simdi, gunluk = yanit["current"], yanit["daily"]
    gunler = []
    for sira in range(min(GUN_SAYISI, len(gunluk["time"]))):
        gunler.append({
            "tarih": gunluk["time"][sira],
            "en_yuksek": gunluk["temperature_2m_max"][sira],
            "en_dusuk": gunluk["temperature_2m_min"][sira],
            "yagis": gunluk["precipitation_probability_max"][sira],   # yağış ihtimali (%), günlük en yüksek
            **_durum(gunluk["weather_code"][sira]),
        })
    return {
        "simdi": {
            "sicaklik": simdi["temperature_2m"],
            "hissedilen": simdi["apparent_temperature"],
            "ruzgar": simdi["wind_speed_10m"],     # km/sa
            "gunduz": bool(simdi["is_day"]),
            **_durum(simdi["weather_code"]),
        },
        "gunler": gunler,
    }


def _dosyadan_yukle():
    """Sunucu yeniden başladıysa önbelleği dosyadan geri alır (dosya yoksa ya da bozuksa boş kalır)."""
    if _onbellek:
        return
    try:
        _onbellek.update(json.loads(ONBELLEK_DOSYASI.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        pass


def _dosyaya_yaz():
    try:
        ONBELLEK_DOSYASI.write_text(json.dumps(_onbellek, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass   # dosyaya yazılamadıysa bellekteki önbellek yine çalışır


def hava_getir(enlem, boylam):
    """Koordinatın hava durumunu döndürür: {simdi, gunler, guncelleme "SS:DD", cevrimdisi}.

    Önbellekteki veri 30 dakikadan yeniyse o döner. Değilse Open-Meteo'dan yenisi istenir;
    istek başarısız olursa önbellekteki son veri "cevrimdisi": True ile döner. Hiç veri yoksa
    HavaHatasi fırlatır.
    """
    # Gizlilik: koordinatlar 2 ondalığa yuvarlanır; servise ve önbelleğe bu hali gider.
    enlem, boylam = round(enlem, 2), round(boylam, 2)
    anahtar = f"{enlem},{boylam}"
    _dosyadan_yukle()
    kayit = _onbellek.get(anahtar)
    if kayit and time.time() - kayit["zaman"] < ONBELLEK_SURESI:
        return {**kayit["veri"], "cevrimdisi": False}
    try:
        yanit = _istek(HAVA_ADRESI, {
            "latitude": enlem, "longitude": boylam,
            "current": "temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            "timezone": "auto",            # günler şehrin kendi saat dilimine göre
            "forecast_days": GUN_SAYISI,
        })
        veri = _sadelestir(yanit)
    except HavaHatasi:
        if kayit:
            return {**kayit["veri"], "cevrimdisi": True}
        raise
    except (KeyError, TypeError, IndexError):
        if kayit:
            return {**kayit["veri"], "cevrimdisi": True}
        raise HavaHatasi("Hava durumu servisinden anlaşılır bir yanıt alınamadı.") from None
    veri["guncelleme"] = datetime.now().strftime("%H:%M")
    # Önbellekte sadece en son kullanılan birkaç konum tutulur.
    _onbellek[anahtar] = {"zaman": time.time(), "veri": veri}
    for eski in sorted(_onbellek, key=lambda a: _onbellek[a]["zaman"])[:-5]:
        del _onbellek[eski]
    _dosyaya_yaz()
    return {**veri, "cevrimdisi": False}
