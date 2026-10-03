# DersTakip
Kişisel akademik takip uygulaması. Mac'te yerelde çalışır.
- Python (Flask) + SQLite + sade HTML/JavaScript. Ağır framework kullanma.
- Veriler proje klasöründeki SQLite dosyasında tutulur.
- İnternet sadece syllabus okuma (Gemini API) için kullanılır.
- API anahtarı .env dosyasında tutulur, .env dosyası .gitignore'da olmalı. Anahtarı kodda yazma.
- Syllabus okuma sağlayıcıdan bağımsız yazılsın.
- Her özellik küçük adımla eklenir, her adımda uygulama çalışır durumda kalır.
- Kullanıcı yeni başlayan biri: kodu sade tut, ne yaptığını kısaca Türkçe açıkla.
- Aynı Wi-Fi'deki telefondan erişim ileride eklenebilir, şimdilik sadece Mac'te çalışsın.
- Dersin takvimdeki bloğuna tıklayınca sağ panel açılacak (hedef harf notuna göre vize/final için gereken not, ders notları). Ders ve değerlendirme verisi buna uygun düzenli tutulur.
- Zorunlu ders bilgileri: ders kodu, kredi, oturum (gün, saat, derslik). Syllabus okurken ve elle girişte aynı doğrulama kullanılır.
- Syllabus okumada bilgi uydurulmaz, bulunamayan alan boş bırakılır.
- Syllabus okuma: sağlayıcı kodu syllabus.py'de (SyllabusParser arayüzü, GeminiParser), okunan veriyi forma çevirme app.py'de (syllabus_forma_cevir). Ayarlar .env'de: GEMINI_API_KEY, GEMINI_MODEL (örnek: .env.example). Yüklenen dosya saklanmaz. Uyulan form kuralları:
  - Saatler tam saat (başlangıç 09:00-20:00, bitiş 10:00-21:00). Tam saat olmayan değer forma yuvarlanmış gelir (başlangıç aşağı, bitiş yukarı) ve o alan sarı "saat yuvarlandı" notuyla işaretlenir.
  - Hedef harf notu zorunlu ama syllabus'tan okunmaz/uydurulmaz: formda boş ve kırmızı gelir, kullanıcı seçer.
  - Oturum türleri: teori, lab. "Notlar" alanı yok: sağlayıcıdan not istenmez, devamsızlık ham metni gibi bilgiler dersin gizli bir alanında durur.
  - Değerlendirme kalemleri app.py'deki sabit tür listesiyle eşleştirilir (Vize 1/2/3, Final, Quiz, Ödev, Proje, Lab, Diğer 1/2/3), her tür derste en fazla bir kez. Sığmayanlar boş "Diğer" yerlerine, yine sığmayanlar onay ekranında "Sığmayan kalemler" uyarısına.
  - Okunan sınav/kalem tarih ve saatleri forma işlenir; takvimde diğer sınavlar gibi görünür.
- Değerlendirme toplamı %100'ü aşabilir (ekstra puan). Ekstra işaretli kalemler ayrı tutulur. Ders puanı 100'e KIRPILMAZ: ekstra puanlar doğrudan toplama eklenir (örn. 103 puan 103 olarak hesaplanır). Bir dersin alabileceği en yüksek puan = normal kalemlerin toplamı + ekstra kalemlerin toplamı. Not hesabında (hedef harf notu için gereken puan, ortalama vb.) bu kural kullanılır.
