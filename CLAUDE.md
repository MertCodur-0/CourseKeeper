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