"""Syllabus (ders izlencesi) okuma: PDF veya görselden ders bilgilerini çıkarır.

Sağlayıcıdan bağımsız yazıldı:
- SyllabusParser : arayüz. Her sağlayıcı bu sınıftan türer ve oku() fonksiyonunu yazar.
- GeminiParser   : Google Gemini API ile çalışan uygulama.
- parser_olustur : .env ayarlarına bakıp kullanılacak parser'ı hazırlar.

Bütün parser'lar aynı biçimde bir sözlük döndürür (aşağıdaki CIKTI_SEMASI).
Bu sözlüğü forma çevirme işi app.py'dedir (syllabus_forma_cevir).
"""

import base64
import json
import logging
import os
import socket
import urllib.error
import urllib.request
from datetime import date

from dotenv import dotenv_values

# GEMINI_MODEL boş bırakılırsa kullanılan model (ücretsiz katmanda çalışan kararlı bir Flash model).
# Güncel model adları: https://ai.google.dev/gemini-api/docs/models
VARSAYILAN_GEMINI_MODELI = "gemini-3.5-flash"
GEMINI_ADRESI = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
ZAMAN_ASIMI = 120   # saniye

gunluk = logging.getLogger(__name__)


class SyllabusHatasi(Exception):
    """Syllabus okunamadığında fırlatılır. Mesajı kullanıcıya gösterilecek sade Türkçe metindir."""


# ============================================================
# ORTAK ÇIKTI BİÇİMİ (hangi sağlayıcı kullanılırsa kullanılsın aynı)
# ============================================================

GUN_ADLARI = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]
OTURUM_TURLERI = ["teori", "lab"]
# Kalemin genel türü. "Vize 1 / Vize 2" gibi numaralandırmayı app.py yapar.
KALEM_TURLERI = ["vize", "final", "quiz", "odev", "proje", "lab", "diger"]


def _bos_olabilir(tip, aciklama, **ek):
    """Belgede bulunamazsa null bırakılabilen bir alanın şeması."""
    return {"type": [tip, "null"], "description": aciklama, **ek}


def _emin_olmayanlar(alanlar):
    return {
        "type": "array",
        "description": "Değerinden EMİN OLMADIĞIN alanların adları (okunaksız, belirsiz, tahmine dayalı). Emin olduklarını yazma.",
        "items": {"type": "string", "enum": alanlar},
    }


# Modelden istenen JSON'un şeması (JSON Schema). Hedef harf notu ve "notlar" bilerek yok.
CIKTI_SEMASI = {
    "type": "object",
    "properties": {
        "kod": _bos_olabilir("string", "Ders kodu, varsa şube/section ile birlikte (ör. 'CMPE 114_01')."),
        "ad": _bos_olabilir("string", "Dersin adı."),
        "kredi": _bos_olabilir("number", "Yerel kredi (credit). AKTS/ECTS DEĞİL."),
        "akts": _bos_olabilir("number", "AKTS / ECTS kredisi."),
        "devamsizlik_yuzde": _bos_olabilir(
            "number", "Devamsızlık hakkı, SADECE belgede yüzde olarak yazıyorsa (ör. %30 için 30). Hesaplama yapma."),
        "devamsizlik_metni": _bos_olabilir(
            "string", "Devamsızlık kuralı yüzde olarak değil de saat/hafta gibi yazılmışsa belgedeki ham metin."),
        "emin_olmayanlar": _emin_olmayanlar(["kod", "ad", "kredi", "akts", "devamsizlik_yuzde"]),
        "oturumlar": {
            "type": "array",
            "description": "Haftalık ders saatleri. Teori ve lab ayrı satırlardaysa ayrı oturumlar.",
            "items": {
                "type": "object",
                "properties": {
                    "gun": _bos_olabilir("string", "Haftanın günü.", enum=GUN_ADLARI),
                    "baslangic": _bos_olabilir("string", "Başlangıç saati, 24 saat biçiminde SS:DD (ör. 13:30)."),
                    "bitis": _bos_olabilir("string", "Bitiş saati, 24 saat biçiminde SS:DD."),
                    "derslik": _bos_olabilir("string", "Derslik / sınıf / oda."),
                    "tur": _bos_olabilir("string", "Oturum türü, belgede belliyse.", enum=OTURUM_TURLERI),
                    "emin_olmayanlar": _emin_olmayanlar(["gun", "baslangic", "bitis", "derslik", "tur"]),
                },
                "required": ["gun", "baslangic", "bitis", "derslik", "tur", "emin_olmayanlar"],
            },
        },
        "degerlendirmeler": {
            "type": "array",
            "description": "Not kalemleri (vize, final, quiz, ödev, proje, lab...), belgedeki sırayla.",
            "items": {
                "type": "object",
                "properties": {
                    "ad": {"type": "string", "description": "Kalemin belgedeki adı (ör. 'Midterm 1', 'Sunum')."},
                    "tur": {"type": "string", "enum": KALEM_TURLERI,
                            "description": "Genel tür. Listedekilere uymuyorsa 'diger'."},
                    "agirlik": _bos_olabilir("number", "Ağırlık yüzdesi (ör. %40 için 40)."),
                    "ekstra_puan": {"type": "boolean",
                                    "description": "Sadece belgede AÇIKÇA bonus / extra credit / ekstra puan "
                                                   "olarak belirtilmişse true, yoksa false."},
                    "tarih": _bos_olabilir("string", "Tarih, YYYY-AA-GG biçiminde."),
                    "baslangic": _bos_olabilir("string", "Başlangıç saati, 24 saat biçiminde SS:DD."),
                    "bitis": _bos_olabilir("string", "Bitiş saati, 24 saat biçiminde SS:DD."),
                    "emin_olmayanlar": _emin_olmayanlar(
                        ["tur", "agirlik", "ekstra_puan", "tarih", "baslangic", "bitis"]),
                },
                "required": ["ad", "tur", "agirlik", "ekstra_puan", "tarih", "baslangic", "bitis",
                             "emin_olmayanlar"],
            },
        },
    },
    "required": ["kod", "ad", "kredi", "akts", "devamsizlik_yuzde", "devamsizlik_metni",
                 "emin_olmayanlar", "oturumlar", "degerlendirmeler"],
}


def talimat_yaz(bugun):
    """Modele verilen talimat. Hangi sağlayıcı olursa olsun aynı metin kullanılır."""
    return f"""Ekteki belge TEK bir üniversite dersinin syllabus'udur (ders izlencesi). Türkçe veya İngilizce olabilir.
Belgeden ders bilgilerini çıkar ve istenen JSON şemasına göre döndür.

EN ÖNEMLİ KURAL: Belgede AÇIKÇA yazmayan hiçbir bilgiyi UYDURMA, tahmin etme, hesaplama.
Bulamadığın ya da okuyamadığın her alanı null bırak. Bulunmayan oturum ya da kalem ekleme.
Değerini yazdığın ama emin olmadığın alanların adını "emin_olmayanlar" listesine ekle.

Alanlar:
- kod: ders kodu; şube / section belgede varsa onu da ekle (ör. "CMPE 114_01").
- kredi: yerel kredi (credit). AKTS / ECTS ile karıştırma; AKTS ayrı alandır ("akts").
  Belgede yalnızca AKTS/ECTS varsa kredi null kalır.
- devamsizlik_yuzde: yalnızca belgede devamsızlık hakkı YÜZDE olarak yazıyorsa.
  Saat, hafta ya da ders sayısı olarak yazıyorsa yüzdeye ÇEVİRME: devamsizlik_yuzde null kalsın,
  belgedeki ham metni devamsizlik_metni alanına yaz.
- oturumlar: haftalık ders saatleri. Teori ve lab ayrı satırlardaysa ayrı oturum yaz; derslikleri farklı olabilir.
  gun: Pazartesi/Monday/Mon/Pzt -> "pazartesi", Salı/Tuesday/Tue/Sal -> "sali", Çarşamba/Wednesday/Wed/Çar -> "carsamba",
  Perşembe/Thursday/Thu/Per -> "persembe", Cuma/Friday/Fri/Cum -> "cuma", Cumartesi/Saturday/Sat/Cmt -> "cumartesi",
  Pazar/Sunday/Sun/Paz -> "pazar".
- Saatler: her zaman 24 saat biçiminde SS:DD yaz (ör. "1:30 PM" -> "13:30"). Saati belgedeki gibi bırak, YUVARLAMA.
- degerlendirmeler: not kalemleri. Her kalemin belgedeki adı (ad), genel türü (tur), ağırlık yüzdesi,
  varsa tarihi ve saatleri. tur: midterm / ara sınav / vize -> "vize"; final -> "final"; quiz / kısa sınav -> "quiz";
  homework / assignment / ödev -> "odev"; project / proje -> "proje"; lab / laboratuvar -> "lab"; diğerleri -> "diger".
  Birden fazla vize varsa her biri ayrı kalemdir. Ağırlığı tek tek değil toplu verilen kalemleri
  (ör. "Quizzes 20%") tek kalem olarak yaz.
- Tarihler: YYYY-AA-GG biçimine çevir (gg.aa.yyyy, gg/aa/yyyy, "15 March", "15 Mart" gibi yazımlar olabilir).
  Belgede yıl yoksa: bugünün tarihi {bugun.isoformat()}; tarihi, bugünün içinde bulunduğu akademik döneme
  denk gelen yılla yaz ve "tarih"i emin_olmayanlar listesine ekle.
- ekstra_puan: kalem belgede AÇIKÇA "bonus", "extra credit", "ekstra puan", "ek puan" gibi bir ifadeyle
  belirtilmişse true, aksi halde false. Ağırlıkların toplamı %100'ü aşsa bile, belgede böyle bir ifade yoksa
  hiçbir kalemi kendiliğinden ekstra sayma; ağırlıkları değiştirme, kalemleri belgedeki gibi yaz.
- Hedef harf notu, öğrencinin kendi notları gibi belgede olmayan bilgiler İSTENMİYOR.
- Dersin harf notu tablosu, not aralıkları, çan eğrisi gibi notlandırma bilgileri de İSTENMİYOR;
  belgede yazsa bile dikkate alma. Sadece yukarıdaki alanları oku.
"""


# ============================================================
# ARAYÜZ
# ============================================================

class SyllabusParser:
    """Syllabus okuyucu arayüzü. Yeni bir sağlayıcı eklemek için bu sınıftan türet."""

    def oku(self, dosya_icerigi, mime_turu):
        """Dosyayı (bytes) okur, CIKTI_SEMASI biçiminde bir sözlük döndürür.

        Okunamazsa SyllabusHatasi fırlatır.
        """
        raise NotImplementedError


# ============================================================
# GEMINI
# ============================================================

class GeminiParser(SyllabusParser):
    """Google Gemini API ile syllabus okur.

    Dosya isteğin içinde gönderilir (Google tarafında dosya olarak saklanmaz).
    API anahtarı sadece istek başlığında gider; mesajlara ve kayıtlara yazılmaz.
    """

    def __init__(self, api_anahtari, model):
        self.api_anahtari = api_anahtari
        self.model = model

    def oku(self, dosya_icerigi, mime_turu):
        istek_govdesi = {
            "contents": [{
                "parts": [
                    {"inline_data": {"mime_type": mime_turu,
                                     "data": base64.b64encode(dosya_icerigi).decode("ascii")}},
                    {"text": talimat_yaz(date.today())},
                ],
            }],
            # Yapılandırılmış çıktı: model sadece bu şemaya uyan JSON döndürür.
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": CIKTI_SEMASI,
            },
        }
        yanit = self._istek_gonder(istek_govdesi)
        return self._yaniti_coz(yanit)

    def _istek_gonder(self, govde):
        istek = urllib.request.Request(
            GEMINI_ADRESI.format(model=self.model),
            data=json.dumps(govde).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": self.api_anahtari},
            method="POST",
        )
        try:
            with urllib.request.urlopen(istek, timeout=ZAMAN_ASIMI) as yanit:
                return json.loads(yanit.read().decode("utf-8"))
        except urllib.error.HTTPError as hata:
            # Gemini isteği reddetti (anahtar, model, kota...).
            raise self._http_hatasi(hata.code, hata.read().decode("utf-8", errors="replace")) from None
        except (socket.timeout, TimeoutError):
            raise SyllabusHatasi("Gemini zamanında yanıt vermedi (zaman aşımı). Biraz sonra tekrar dene.") from None
        except urllib.error.URLError as hata:
            if isinstance(hata.reason, (socket.timeout, TimeoutError)):
                raise SyllabusHatasi(
                    "Gemini zamanında yanıt vermedi (zaman aşımı). Biraz sonra tekrar dene.") from None
            raise SyllabusHatasi(
                "Gemini'ye ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.") from None
        except (ValueError, OSError):
            raise SyllabusHatasi("Gemini'den anlaşılır bir yanıt alınamadı. Biraz sonra tekrar dene.") from None

    def _http_hatasi(self, http_kodu, govde):
        """Gemini'nin hata yanıtını kullanıcıya gösterilecek sade mesaja çevirir."""
        try:
            hata = json.loads(govde).get("error", {})
        except (ValueError, AttributeError):
            hata = {}
        durum = str(hata.get("status") or hata.get("code") or "")
        mesaj = str(hata.get("message") or "")
        # Terminale kısa bir kayıt düş; anahtar her ihtimale karşı gizlenir.
        gunluk.warning("Gemini hatası: HTTP %s %s - %s", http_kodu, durum,
                       mesaj.replace(self.api_anahtari, "***")[:300])

        kucuk = mesaj.lower()
        model_hatasi = (
            f"\"{self.model}\" modeli bulunamadı ya da bu anahtar/plan ile kullanılamıyor. "
            ".env dosyasındaki GEMINI_MODEL ayarını değiştir (boş bırakırsan varsayılan model kullanılır) "
            "ve tekrar dene."
        )
        if http_kodu == 429:
            if "limit: 0" in kucuk:
                return SyllabusHatasi(model_hatasi)
            return SyllabusHatasi(
                "Gemini kullanım kotası doldu (çok fazla istek). Birkaç dakika bekleyip tekrar dene; "
                "sürekli oluyorsa .env dosyasındaki GEMINI_MODEL ayarını başka bir modelle değiştir.")
        if http_kodu == 404 or ("model" in kucuk and ("not found" in kucuk or "not supported" in kucuk)):
            return SyllabusHatasi(model_hatasi)
        if http_kodu in (401, 403) or "api key" in kucuk or "API_KEY" in govde:
            return SyllabusHatasi(
                "Gemini API anahtarı kabul edilmedi (yanlış, süresi dolmuş ya da yetkisiz). "
                ".env dosyasındaki GEMINI_API_KEY değerini kontrol et.")
        if http_kodu == 400 and "FAILED_PRECONDITION" in durum.upper():
            return SyllabusHatasi(model_hatasi)
        if http_kodu == 400:
            return SyllabusHatasi(
                "Gemini bu dosyayı okuyamadı. Dosya bozuk, şifreli ya da çok büyük olabilir; başka bir dosya dene.")
        if http_kodu == 504:
            return SyllabusHatasi("Gemini zamanında yanıt vermedi (zaman aşımı). Biraz sonra tekrar dene.")
        return SyllabusHatasi(
            f"Gemini şu anda yanıt veremiyor (hata {http_kodu}). Biraz sonra tekrar dene.")

    def _yaniti_coz(self, yanit):
        """Gemini yanıtının içindeki JSON metnini sözlüğe çevirir."""
        try:
            parcalar = yanit["candidates"][0]["content"]["parts"]
            yazi = "".join(parca.get("text", "") for parca in parcalar if not parca.get("thought"))
            veri = json.loads(yazi)
        except (KeyError, IndexError, TypeError, AttributeError, ValueError):
            veri = None
        if not isinstance(veri, dict):
            raise SyllabusHatasi(
                "Model anlaşılır bir yanıt döndürmedi (geçersiz JSON). Tekrar dene; "
                "sürekli oluyorsa daha net bir dosya kullan.")
        return veri


# ============================================================
# AYARLAR (.env)
# ============================================================

def parser_olustur(env_dosyasi):
    """.env dosyasındaki ayarlara göre kullanılacak parser'ı hazırlar.

    Ayarlar her okumada yeniden okunur; .env'yi değiştirince sunucuyu yeniden başlatmak gerekmez.
    """
    ayarlar = dotenv_values(env_dosyasi)

    def ayar(ad):
        return (ayarlar.get(ad) or os.environ.get(ad) or "").strip()

    api_anahtari = ayar("GEMINI_API_KEY")
    if not api_anahtari:
        raise SyllabusHatasi(
            "Gemini API anahtarı bulunamadı. Proje klasöründeki .env dosyasına "
            "GEMINI_API_KEY=... satırını ekle (örnek: .env.example).")
    return GeminiParser(api_anahtari, ayar("GEMINI_MODEL") or VARSAYILAN_GEMINI_MODELI)
