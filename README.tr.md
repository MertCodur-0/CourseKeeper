# DersTakip

[English](README.md) | **Türkçe**

Üniversite öğrencileri için kişisel akademik takip uygulaması. Derslerini, sınavlarını, notlarını, devamsızlığını ve GPA'ini tek bir ekranda takip edersin. Mac'te yerel olarak çalışır; verilerin bilgisayarında kalır.

<!-- Ekran görüntülerini veya GIF'leri docs/ klasörüne koyup buraya ekle, örneğin:
![Ana ekran](docs/ana-ekran.png)
-->

## Özellikler

**Haftalık takvim**
- Dersler ve sınavlar haftalık takvimde renkli bloklar olarak görünür.
- Aynı saate denk gelen dersler ve sınavlar da birbirini kapatmadan gösterilir.

**Syllabus'tan ders ekleme**
- Dersin syllabus'unu (PDF, PNG veya JPG) yükle; ders kodu, kredi, AKTS, ders saatleri, derslikler, devamsızlık hakkı ve değerlendirme kalemleri Gemini ile okunur.
- Okunan bilgiler kaydedilmeden önce bir forma düşer. Modelin emin olmadığı veya yuvarlanan alanlar sarıyla işaretlenir, sen kontrol edip kaydedersin.
- Belgede yazmayan bilgi uydurulmaz, boş bırakılır. Dersi elle de ekleyebilirsin.

**Not hesabı**
- Her ders için hedef harf notu seçilir (AA–DD).
- Girdiğin notlara göre şu anki puanın, seviyen ve hedefe ulaşmak için kalan sınavlardan ne alman gerektiği hesaplanır.
- %100'ü aşan değerlendirmeler (ekstra puan) desteklenir.

**Devamsızlık**
- Yoklama ders saati bazında tutulur: 2 saatlik dersin sadece bir saatine katılmadıysan 1 saat devamsızlık sayılır.
- Durumlar: katıldım, katılmadım, yoklama alınmadı, ders iptal.
- Teori ve lab için ayrı devamsızlık sınırları tanımlanabilir. Sınıra yaklaşınca uyarı gösterilir.

**Dönem ve GPA**
- Akademik takvimi üniversitenin sayfa adresinden ya da PDF/görselden okutarak dönem tarihlerini, tatilleri ve sınav dönemlerini doldurabilirsin.
- Önceki kredin ve GPA'in girilince, hedef harf notlarına göre dönem sonu genel GPA'in hesaplanır. Kredi veya AKTS ile hesaplama seçilebilir.

**Diğer**
- Genel bakış: hava durumu, dönem ilerlemesi ve sonraki sınav.
- Dersler, sınavlar ve notlar içinde arama (⌘K).
- Açık ve koyu tema.

## Kurulum

Gerekenler: macOS, Python 3 ve (syllabus/akademik takvim okumak için) bir Gemini API anahtarı.

1. Projeyi indir:
   ```bash
   git clone https://github.com/MertCodur-0/DersTakip.git
   cd DersTakip
   ```

2. Ayar dosyasını oluştur:
   ```bash
   cp .env.example .env
   ```
   `.env` dosyasını açıp `GEMINI_API_KEY=` satırına anahtarını yaz. Anahtarı [Google AI Studio](https://aistudio.google.com/apikey) üzerinden ücretsiz alabilirsin. Anahtar olmadan da uygulama çalışır; sadece syllabus ve akademik takvim okuma kullanılamaz.

3. `baslat.command` dosyasına çift tıkla.
   İlk açılışta gerekli paketler kurulur, sonra uygulama tarayıcıda `http://127.0.0.1:5001` adresinde açılır. Kapatmak için açılan Terminal penceresinde `Ctrl+C`'ye bas.

   > macOS dosyayı açmana izin vermezse: dosyaya sağ tıkla → **Aç**.

Terminalden başlatmak istersen:
```bash
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/python app.py
```

## Veriler ve gizlilik

- Bütün verilerin proje klasöründeki `derstakip.db` dosyasında tutulur. Bu dosya ve `.env` git'e eklenmez.
- Uygulama sadece bu bilgisayardan erişilebilir (`127.0.0.1`).
- İnternet yalnızca şunlar için kullanılır:
  - Syllabus ve akademik takvim okuma (yüklenen dosya Gemini API'ye gönderilir, uygulamada saklanmaz),
  - Hava durumu ([Open-Meteo](https://open-meteo.com), anahtar gerektirmez; konum yaklaşık 1 km'ye yuvarlanarak gönderilir).
- `derstakip.db` dosyasının yedeğini düzenli olarak almanı öneririm.

## Teknolojiler

- **Sunucu:** Python, Flask
- **Veritabanı:** SQLite
- **Arayüz:** HTML, CSS ve sade JavaScript (harici kütüphane veya font yok)
- **Belge okuma:** Google Gemini API (yapılandırılmış JSON çıktısı). Okuma kodu sağlayıcıdan bağımsız yazıldı; başka bir model eklemek için `syllabus.py`'deki `SyllabusParser` sınıfından türetmek yeterli.

## Proje yapısı

```
app.py               Sunucu, veritabanı ve API
syllabus.py          Syllabus okuma (Gemini)
akademik_takvim.py   Akademik takvim okuma (sayfa adresi veya dosya)
hava.py              Hava durumu (Open-Meteo)
templates/index.html Sayfa
static/              JavaScript ve CSS
baslat.command       Çift tıkla başlatma dosyası
```

## Notlar

- Harf notu ölçeği mutlak sistemdir: AA 90–100, BA 85–89, BB 80–84, CB 75–79, CC 70–74, DC 60–69, DD 50–59, F 0–49. Bağıl (çan) notlandırma desteklenmez. Ölçek `app.py` içinde `NOT_OLCEGI` listesinde tanımlıdır.
- Takvim 09:00–21:00 arasını ve tam saatleri gösterir.
